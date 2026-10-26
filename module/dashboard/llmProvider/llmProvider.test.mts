/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// Run from parent folder: pnpm exec vitest run llmProvider/llmProvider.test.mts

import { beforeAll, describe, expect, it } from "vitest";
import { getLlmProvider, getProviderInstance, type ILlmProvider } from "../agentChat.llm.mjs";
import { ClaudeProvider, OpenaiCompatibleProvider, OpenvinoProvider } from "./index.mjs";
import { testCompletionSmall } from "./perftestHelper.mjs";

describe.sequential("LLM provider integration", () => {
  describe("LLM provider from localsettings", () => {
    let provider: ILlmProvider;
    let model: string;

    beforeAll(async () => {
      // The setup loads local.settings.json Values into process.env.
      const providerName = getLlmProvider();
      provider = getProviderInstance();
      model = process.env.AGENT_MODEL ?? process.env.LLM_MODEL ?? "";

      expect(provider.name).toBe(providerName);
      await provider.assertReady();
    }, 180_000);

    it("returns JSON object", async () => {
      await testJsonObject(provider, model);
    }, 200_000);

    it("basic request", async () => {
      await testBasicRequest(provider, model);
    }, 200_000);
  });

  describe("OpenVINO provider", () => {
    registerProviderTests(
      () =>
        new OpenvinoProvider({
          localModelDir: "D:\\Models\\OpenVINO\\Qwen3.5-9B-int4-ov",
          device: "GPU",
        }),
      "D:\\Models\\OpenVINO\\Qwen3.5-9B-int4-ov"
    );
  });

  describe("Ollama provider", () => {
    registerProviderTests(
      () =>
        new OpenaiCompatibleProvider("ollama", {
          baseUrl: "http://localhost:11434/v1",
          apiKey: "",
        }),
      "qwen2.5:3b"
    );
  });

  describe("OpenAI provider", () => {
    registerProviderTests(() => {
      const apiKey = process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY;
      if (!apiKey) {
        throw new Error("OpenAI preset requires OPENAI_API_KEY or LLM_API_KEY in local.settings.json or the environment.");
      }
      return new OpenaiCompatibleProvider("openai", {
        baseUrl: "https://api.openai.com/v1",
        apiKey,
      });
    }, "gpt-5-mini");
  });

  describe("Claude provider", () => {
    registerProviderTests(() => new ClaudeProvider(), "haiku");
  });

  describe("OVMS provider", () => {
    registerProviderTests(
      () => new OpenaiCompatibleProvider("ovms", { baseUrl: "http://127.0.0.1:8000/v3" }),
      async () => {
        const response = await fetch("http://127.0.0.1:8000/v3/models", { signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error(`OVMS model-list request failed (${response.status}).`);
        const body = (await response.json()) as { data?: Array<{ id?: string }> };
        const model = body.data?.[0]?.id;
        if (!model) throw new Error("OVMS returned no model IDs from /v3/models.");
        return model;
      }
    );
  });
});

function registerProviderTests(createProvider: () => ILlmProvider, configuredModel: string | (() => Promise<string>)): void {
  let provider: ILlmProvider;
  let model: string;

  beforeAll(async () => {
    provider = createProvider();
    await provider.assertReady();
    model = typeof configuredModel === "string" ? configuredModel : await configuredModel();
  }, 180_000);

  it("returns JSON object", async () => {
    await testJsonObject(provider, model);
  }, 200_000);

  it("basic request", async () => {
    await testBasicRequest(provider, model);
  }, 200_000);
}

export async function testJsonObject(provider: ILlmProvider, model: string): Promise<void> {
  await testCompletionSmall(provider, model);
}

export async function testBasicRequest(provider: ILlmProvider, model: string): Promise<void> {
  const result = await provider.completeJson({
    systemPrompt: "Add the two input numbers and return their sum as a JSON object with a numeric answer property. No reasoning or other text.",
    input: { a: 7, b: 5 },
    model,
    schema: {
      type: "object",
      properties: { answer: { type: "number" } },
      required: ["answer"],
      additionalProperties: false,
    },
    options: { maxTokens: 128 },
  });

  expect(result).toEqual({ answer: 12 });
}
