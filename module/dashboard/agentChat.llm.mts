/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ILlmProvider,
  type LlmCompletionOptions,
  type LlmJsonSchema,
  OpenvinoProvider,
  OpenaiCompatibleProvider,
  ClaudeProvider,
} from "./llmProvider/index.mjs";

export * from "./llmProvider/index.mjs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const localSettingsPath = existsSync(path.resolve(currentDir, "local.settings.json"))
  ? path.resolve(currentDir, "local.settings.json")
  : path.resolve(currentDir, "..", "local.settings.json");

function ensureSettingsLoaded() {
  if (!process.env.LLM_PROVIDER && existsSync(localSettingsPath)) {
    try {
      const parsed = JSON.parse(readFileSync(localSettingsPath, "utf8"));
      if (parsed.Values) {
        for (const [key, value] of Object.entries(parsed.Values)) {
          if (process.env[key] === undefined) {
            process.env[key] = String(value);
          }
        }
      }
    } catch {
      // Ignore if local.settings.json cannot be read
    }
  }
}

export function getLlmProvider(): string {
  ensureSettingsLoaded();
  const provider = (process.env.LLM_PROVIDER ?? process.env.LLM)?.trim().toLowerCase();
  if (!provider) {
    throw new Error(
      "No LLM provider selected. Configure 'LLM_PROVIDER' in local.settings.json (under 'Values') or as an environment variable.\n\n" +
        "Available options:\n" +
        '  - "openvino" : In-process OpenVINO GenAI execution via openvino-genai-node (fast local inference on GPU/CPU/NPU).\n' +
        "                 Optional settings: 'LLM_MODEL' / 'OPENVINO_MODEL_DIR'\n" +
        "                                    'OPENVINO_DEVICE' (default: GPU, with CPU fallback)\n" +
        "  - \"ollama\"   : Local Ollama / OpenAI-compatible endpoint (requires 'LLM_BASE_URL' and 'AGENT_MODEL').\n" +
        "  - \"openai\"   : OpenAI API or compatible endpoint (requires 'LLM_BASE_URL', 'LLM_API_KEY', and 'AGENT_MODEL').\n" +
        "  - \"claude\"   : Anthropic Claude CLI (runs 'claude' CLI; requires a logged-in CLI session)."
    );
  }
  if (!["openvino", "ollama", "openai", "claude"].includes(provider)) {
    throw new Error(
      `Unknown LLM provider '${provider}'.\n\n` + "Available options:\n" + '  - "openvino"\n' + '  - "ollama"\n' + '  - "openai"\n' + '  - "claude"'
    );
  }
  return provider;
}

const openvinoProvider = new OpenvinoProvider();
const ollamaProvider = new OpenaiCompatibleProvider("ollama");
const openaiProvider = new OpenaiCompatibleProvider("openai");
const claudeProvider = new ClaudeProvider();

const providers: Record<string, ILlmProvider> = {
  openvino: openvinoProvider,
  ollama: ollamaProvider,
  openai: openaiProvider,
  claude: claudeProvider,
};

export function getProviderInstance(name?: string): ILlmProvider {
  const providerName = name ?? getLlmProvider();
  const instance = providers[providerName];
  if (!instance) {
    throw new Error(`Unsupported LLM provider '${providerName}'`);
  }
  return instance;
}

export async function getOpenVinoPipeline(modelDir?: string) {
  return await openvinoProvider.getPipeline(modelDir);
}

export async function assertLlmReady() {
  const provider = getProviderInstance();
  await provider.assertReady();
}

export async function llm(
  systemPrompt: string,
  input: unknown,
  model: string,
  schema: LlmJsonSchema,
  sandbox?: string,
  options?: LlmCompletionOptions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const provider = getProviderInstance();
  return (await provider.completeJson({
    systemPrompt,
    input,
    model,
    schema,
    sandbox,
    options,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })) as any;
}
