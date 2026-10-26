/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { existsSync } from "node:fs";
import path from "node:path";
import type { GenerationConfig } from "openvino-genai-node";
import { clip, type ILlmProvider, type LlmProviderConfig, type LlmRequest } from "./contract.mjs";

export type OpenVinoPipelineInstance = {
  generate(prompt: string, config: GenerationConfig): Promise<{ texts: string[] }>;
};

export interface OpenvinoProviderConfig extends LlmProviderConfig {
  localModelDir?: string;
  modelName?: string;
  device?: string;
  maxTokens?: number;
  pipelineFactory?: (modelDir: string, device: string) => Promise<OpenVinoPipelineInstance>;
}

export class OpenvinoProvider implements ILlmProvider {
  readonly name = "openvino";
  readonly config: OpenvinoProviderConfig;

  private pipeline: OpenVinoPipelineInstance | null = null;
  private currentPipelineModelDir = "";
  private queue: Promise<void> = Promise.resolve();

  constructor(configOrLocalModelDir?: OpenvinoProviderConfig | string, modelName?: string) {
    if (typeof configOrLocalModelDir === "string") {
      this.config = {
        localModelDir: configOrLocalModelDir,
        modelName,
      };
    } else {
      this.config = configOrLocalModelDir ?? {};
      if (modelName && !this.config.modelName) {
        this.config.modelName = modelName;
      }
    }
  }

  get localModelDir(): string | undefined {
    return this.config.localModelDir ?? process.env.LLM_MODEL ?? process.env.OPENVINO_MODEL_DIR;
  }

  get modelName(): string | undefined {
    return this.config.modelName;
  }

  get device(): string {
    return this.config.device ?? process.env.OPENVINO_DEVICE ?? "GPU";
  }

  get maxTokens(): number {
    return this.config.maxTokens ?? (process.env.OPENVINO_MAX_TOKENS ? Number(process.env.OPENVINO_MAX_TOKENS) : 2048);
  }

  async getPipeline(modelDir?: string): Promise<OpenVinoPipelineInstance> {
    const targetDir = modelDir && (path.isAbsolute(modelDir) || existsSync(modelDir)) ? modelDir : this.localModelDir;

    if (this.pipeline && this.currentPipelineModelDir === targetDir) {
      return this.pipeline;
    }

    if (!targetDir || !existsSync(targetDir)) {
      throw new Error(`OpenVINO model directory not found: ${targetDir}. Please configure LLM_MODEL or OPENVINO_MODEL_DIR.`);
    }

    const preferredDevice = this.device;

    if (this.config.pipelineFactory) {
      this.pipeline = await this.config.pipelineFactory(targetDir, preferredDevice);
      this.currentPipelineModelDir = targetDir;
      return this.pipeline;
    }

    const { LLMPipeline, VLMPipeline } = await import("openvino-genai-node");
    const createPipeline = async (device: string): Promise<OpenVinoPipelineInstance> => {
      // Multimodal exports use inputs_embeds, not the input_ids expected by LLMPipeline.
      if (existsSync(path.join(targetDir, "openvino_vision_embeddings_model.xml"))) {
        const pipeline = await VLMPipeline(targetDir, device);
        return {
          generate: (prompt, generationConfig) => pipeline.generate(prompt, { generationConfig }),
        };
      }
      return await LLMPipeline(targetDir, device);
    };

    try {
      this.pipeline = await createPipeline(preferredDevice);
      this.currentPipelineModelDir = targetDir;
    } catch (err: unknown) {
      const errorDetail = err instanceof Error ? err.message : String(err);
      if (preferredDevice !== "CPU") {
        console.warn(`[OpenVINO] Failed to initialize on ${preferredDevice} (${errorDetail}). Retrying on CPU...`);
        this.pipeline = await createPipeline("CPU");
        this.currentPipelineModelDir = targetDir;
      } else {
        throw err;
      }
    }

    return this.pipeline;
  }

  async assertReady(): Promise<void> {
    const targetDir = this.localModelDir;
    if (!targetDir || !existsSync(targetDir)) {
      throw new Error(`OpenVINO model directory does not exist: ${targetDir}`);
    }
    await this.getPipeline(targetDir);
  }

  private async generate<TOutput = unknown>(request: LlmRequest): Promise<TOutput> {
    const startedAt = performance.now();
    const pipe = await this.getPipeline(request.model);
    const { StructuredOutputConfig } = await import("openvino-genai-node");

    const prompt = `<|im_start|>system\n${request.systemPrompt}\n\nReply with only one JSON object that matches this JSON Schema, no other text:\n${JSON.stringify(request.schema)}<|im_end|>\n<|im_start|>user\n${JSON.stringify(request.input)}<|im_end|>\n<|im_start|>assistant\n`;

    let structConfig: InstanceType<typeof StructuredOutputConfig> | undefined;
    if (request.schema) {
      try {
        structConfig = new StructuredOutputConfig({
          json_schema: JSON.stringify(request.schema),
        });
      } catch {
        structConfig = undefined;
      }
    }

    const maxTokens = Number((request.options?.maxTokens as number | undefined) ?? this.maxTokens);
    const genOptions: GenerationConfig = { max_new_tokens: maxTokens };
    if (structConfig) {
      genOptions.structured_output_config = structConfig;
    }

    const res = await pipe.generate(prompt, genOptions);
    const perfMetrics = (res as typeof res & { perfMetrics?: { getNumGeneratedTokens?: () => number } }).perfMetrics;
    const outputTokens = perfMetrics?.getNumGeneratedTokens?.();
    if (typeof outputTokens === "number") {
      request.onMetrics?.({ outputTokens, elapsedMs: performance.now() - startedAt });
    }
    const text = res.texts?.[0] ?? "";
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace < 0 || lastBrace < firstBrace) {
      throw new Error(`OpenVINO reply is not JSON: ${clip(text, 200)}`);
    }
    const out = (() => {
      try {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1));
      } catch {
        throw new Error(`OpenVINO reply is not valid JSON: ${clip(text, 200)}`);
      }
    })();

    if (request.schema?.required && Array.isArray(request.schema.required)) {
      const missing = request.schema.required.filter((key: string) => !(key in out));
      if (missing.length) throw new Error(`OpenVINO reply misses ${missing.join(", ")}`);
    }

    return out as TOutput;
  }

  async completeJson<TOutput = unknown>(request: LlmRequest): Promise<TOutput> {
    const result = this.queue.then(() => this.generate<TOutput>(request));
    // Keep the single-pipeline queue usable after errors; callers still receive the original rejection.
    this.queue = result.then(
      () => undefined,
      () => undefined
    );
    return await result;
  }
}
