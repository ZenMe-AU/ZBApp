/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// Run from parent folder: pnpm exec vitest run llmProvider/llmprovider.perf.test.mts

import { describe, it } from "vitest";
import { ClaudeProvider } from "./claude.provider.mjs";
import type { ILlmProvider } from "./contract.mjs";
import { OpenvinoProvider } from "./openvino.provider.mjs";
import { OpenaiCompatibleProvider } from "./openaiCompatible.provider.mjs";
import { providerSettings, testCompletionMed, testCompletionSmall } from "./perftestHelper.mjs";

const settings = providerSettings();

registerProviderTests(
  "OpenVINO",
  new OpenvinoProvider({
    localModelDir: settings.OPENVINO_MODEL_DIR ?? settings.LLM_MODEL,
    device: settings.OPENVINO_DEVICE ?? "GPU",
  }),
  settings.OPENVINO_MODEL_DIR ?? settings.LLM_MODEL
);
registerProviderTests(
  "OVMS",
  new OpenaiCompatibleProvider("ovms", {
    baseUrl: settings.OVMS_BASE_URL,
    apiKey: "",
  }),
  settings.OVMS_MODEL
);
registerProviderTests(
  "Ollama",
  new OpenaiCompatibleProvider("ollama", {
    baseUrl: settings.OLLAMA_BASE_URL,
    apiKey: "",
  }),
  settings.OLLAMA_MODEL
);
registerProviderTests("Claude", new ClaudeProvider(), settings.CLAUDE_MODEL);

function registerProviderTests(name: string, provider: ILlmProvider, model: string): void {
  describe.sequential(`${name} provider`, () => {
    it("small completion", async () => {
      await testCompletionSmall(provider, model);
    }, 180_000);

    it("medium completion", async () => {
      await testCompletionMed(provider, model);
    }, 180_000);
  });
}
