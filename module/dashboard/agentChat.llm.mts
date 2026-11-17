/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { readFileSync } from "node:fs";
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
const localSettingsPath = path.join(path.basename(currentDir) === "dist" ? path.dirname(currentDir) : currentDir, "local.settings.json");

export function loadRuntimeSettings(env: NodeJS.ProcessEnv = process.env, settingsPath = localSettingsPath): NodeJS.ProcessEnv {
  let values = {};
  try {
    values = JSON.parse(readFileSync(settingsPath, "utf8")).Values ?? {};
    if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("Invalid Values");
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error("Cannot load Dashboard local.settings.json: check file access and JSON Values");
  }
  return { ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])),
    ...Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined)) };
}

export function getLlmProvider(env: NodeJS.ProcessEnv = process.env): string {
  if (env === process.env) Object.assign(env, loadRuntimeSettings(env));
  const provider = (env.LLM_PROVIDER ?? env.LLM)?.trim().toLowerCase();
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

export function getLlmModel(role: "AGENT" | "JUDGE" | "CHAT" | "REFEREE", env: NodeJS.ProcessEnv = process.env, fallback = ""): string {
  const provider = getLlmProvider(env);
  const providerModel = provider === "claude" ? env.CLAUDE_MODEL
    : provider === "openai" ? env.OPENAI_MODEL ?? env.LLM_MODEL
    : provider === "ollama" ? env.OLLAMA_MODEL ?? env.LLM_MODEL
    : env.LLM_MODEL ?? env.OPENVINO_MODEL_DIR;
  const previousFallback = role === "JUDGE" ? env.AGENT_MODEL : role === "REFEREE" ? env.JUDGE_MODEL : undefined;
  const model = env[`${role}_MODEL`] ?? providerModel ?? (provider === "claude" ? fallback : previousFallback ?? "");
  if (!model?.trim() && provider !== "claude") throw new Error(`Missing model for ${role} (${provider}); configure ${role}_MODEL or the provider model`);
  return model ?? "";
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
