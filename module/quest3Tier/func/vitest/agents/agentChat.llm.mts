/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { LLMPipeline, GenerationConfig } from "openvino-genai-node";

type OpenVinoPipelineInstance = Awaited<ReturnType<typeof LLMPipeline>>;

const execFileAsync = promisify(execFile);
const installerBin = path.join(os.homedir(), ".local/bin/claude");
const claudeBin = process.env.CLAUDE_BIN ?? (existsSync(installerBin) ? installerBin : "claude");
const cliEnv = { ...process.env };
delete cliEnv.NODE_OPTIONS;
delete cliEnv.VSCODE_INSPECTOR_OPTIONS;

export const DEFAULT_OPENVINO_MODEL_DIR = "D:\\Models\\Qwen2.5-Coder-3B-Instruct-int4-ov";

const clip = (value, length) => {
  const text = String(value);
  return text.length > length ? `${text.slice(0, length)}...` : text;
};

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const localSettingsPath = path.resolve(currentDir, "..", "..", "local.settings.json");

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
        "                 Optional settings: 'OPENVINO_MODEL_DIR' (default: D:\\Models\\Qwen2.5-Coder-3B-Instruct-int4-ov)\n" +
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

let openvinoPipeline: OpenVinoPipelineInstance | null = null;
let currentPipelineModelDir = "";

export async function getOpenVinoPipeline(modelDir?: string): Promise<OpenVinoPipelineInstance> {
  const targetDir = modelDir && existsSync(modelDir) ? modelDir : (process.env.OPENVINO_MODEL_DIR ?? DEFAULT_OPENVINO_MODEL_DIR);

  if (openvinoPipeline && currentPipelineModelDir === targetDir) {
    return openvinoPipeline;
  }

  if (!existsSync(targetDir)) {
    throw new Error(`OpenVINO model directory not found: ${targetDir}. Please verify OPENVINO_MODEL_DIR.`);
  }

  const { LLMPipeline } = await import("openvino-genai-node");
  const device = process.env.OPENVINO_DEVICE ?? "GPU";

  try {
    openvinoPipeline = await LLMPipeline(targetDir, device);
    currentPipelineModelDir = targetDir;
  } catch (err: unknown) {
    const errorDetail = err instanceof Error ? err.message : String(err);
    if (device !== "CPU") {
      console.warn(`[OpenVINO] Failed to initialize on ${device} (${errorDetail}). Retrying on CPU...`);
      openvinoPipeline = await LLMPipeline(targetDir, "CPU");
      currentPipelineModelDir = targetDir;
    } else {
      throw err;
    }
  }

  return openvinoPipeline;
}

export async function assertLlmReady() {
  const provider = getLlmProvider();
  if (provider === "openvino") {
    const targetDir =
      process.env.OPENVINO_MODEL_DIR && existsSync(process.env.OPENVINO_MODEL_DIR) ? process.env.OPENVINO_MODEL_DIR : DEFAULT_OPENVINO_MODEL_DIR;
    if (!existsSync(targetDir)) {
      throw new Error(`OpenVINO model directory does not exist: ${targetDir}`);
    }
    await getOpenVinoPipeline(targetDir);
    return;
  }
  if (provider === "ollama" || provider === "openai") {
    if (!process.env.LLM_BASE_URL) {
      throw new Error(`LLM_PROVIDER='${provider}' requires 'LLM_BASE_URL' to be configured in local.settings.json or environment variables.`);
    }
    return;
  }
  if (provider === "claude") {
    const result = await execFileAsync(claudeBin, ["auth", "status", "--json"], { env: cliEnv }).catch((error) => ({
      stdout: error.stdout,
      error,
    }));
    const status = (() => {
      try {
        return JSON.parse(String(result.stdout));
      } catch {
        throw new Error(`Claude CLI check failed: ${"error" in result ? result.error?.message : "no output"}`);
      }
    })();
    if (!status.loggedIn) throw new Error("Claude CLI is not logged in. Run `claude /login` in the VS Code terminal, then start the test again.");
  }
}

async function claude(systemPrompt, input, model, schema, sandbox, { effort, thinking }) {
  const args = ["-p", "--system-prompt", systemPrompt, "--model", model, "--effort", effort];
  if (!thinking) args.push("--settings", JSON.stringify({ alwaysThinkingEnabled: false }));
  args.push("--tools", "", "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence");
  args.push("--output-format", "json", "--json-schema", JSON.stringify(schema));
  const run = execFileAsync(claudeBin, args, {
    cwd: sandbox,
    env: cliEnv,
    maxBuffer: 20 * 1024 * 1024,
    timeout: 3 * 60 * 1000,
    killSignal: "SIGKILL",
  });
  run.child.stdin.end(JSON.stringify(input));
  const { stdout } = await run.catch((error) => {
    if (error.killed) throw new Error("claude timed out");
    const cause = (() => {
      try {
        return JSON.parse(error.stdout).result;
      } catch {
        return error.stderr?.trim() || "no output";
      }
    })();
    throw new Error(`claude exited ${error.code}: ${clip(cause, 300)}`);
  });
  const out = JSON.parse(stdout);
  if (out.is_error) throw new Error(out.result || "Claude CLI error");
  if (!out.structured_output) throw new Error(`no structured output: ${out.subtype} ${clip(out.result, 200)}`);
  return out.structured_output;
}

async function openaiCompatible(systemPrompt, input, model, schema) {
  const res = await fetch(`${process.env.LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(process.env.LLM_API_KEY && { authorization: `Bearer ${process.env.LLM_API_KEY}` }) },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `${systemPrompt}\n\nReply with only one JSON object that matches this JSON Schema, no other text:\n${JSON.stringify(schema)}`,
        },
        { role: "user", content: JSON.stringify(input) },
      ],
      ...(schema && {
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "output",
            strict: true,
            schema,
          },
        },
      }),
    }),
    signal: AbortSignal.timeout(3 * 60 * 1000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`LLM API ${res.status}: ${clip(JSON.stringify(body?.error ?? body), 300)}`);
  const text = body?.choices?.[0]?.message?.content ?? "";
  const out = (() => {
    try {
      return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    } catch {
      throw new Error(`LLM reply is not JSON: ${clip(text, 200)}`);
    }
  })();
  const missing = schema.required.filter((key) => !(key in out));
  if (missing.length) throw new Error(`LLM reply misses ${missing.join(", ")}`);
  return out;
}

async function openvino(systemPrompt, input, model, schema) {
  const pipe = await getOpenVinoPipeline(model);
  const { StructuredOutputConfig } = await import("openvino-genai-node");

  const prompt = `<|im_start|>system\n${systemPrompt}\n\nReply with only one JSON object that matches this JSON Schema, no other text:\n${JSON.stringify(schema)}<|im_end|>\n<|im_start|>user\n${JSON.stringify(input)}<|im_end|>\n<|im_start|>assistant\n`;

  let structConfig: InstanceType<typeof StructuredOutputConfig> | undefined;
  if (schema) {
    try {
      structConfig = new StructuredOutputConfig({ json_schema: JSON.stringify(schema) });
    } catch {
      structConfig = undefined;
    }
  }

  const maxTokens = Number(process.env.OPENVINO_MAX_TOKENS ?? 2048);
  const genOptions: GenerationConfig = { max_new_tokens: maxTokens };
  if (structConfig) {
    genOptions.structured_output_config = structConfig;
  }

  const res = await pipe.generate(prompt, genOptions);
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

  if (schema?.required && Array.isArray(schema.required)) {
    const missing = schema.required.filter((key: string) => !(key in out));
    if (missing.length) throw new Error(`OpenVINO reply misses ${missing.join(", ")}`);
  }

  return out;
}

export const llm = async (systemPrompt, input, model, schema, sandbox, options) => {
  const provider = getLlmProvider();
  switch (provider) {
    case "openvino":
      return await openvino(systemPrompt, input, model, schema);
    case "ollama":
    case "openai":
      return await openaiCompatible(systemPrompt, input, model, schema);
    case "claude":
      return await claude(systemPrompt, input, model, schema, sandbox, options);
  }
};
