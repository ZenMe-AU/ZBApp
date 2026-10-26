/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// Run from parent folder: pnpm exec vitest run llmProvider/ollama.perf.test.mts

import { describe, it } from "vitest";
import { OpenaiCompatibleProvider } from "./openaiCompatible.provider.mjs";
import {
  providerSettings,
  testCompletionMed,
  testCompletionSmall,
} from "./perftestHelper.mjs";

describe("Ollama provider", () => {
  it("quick integration and performance", async () => {
    const settings = providerSettings();
    const provider = new OpenaiCompatibleProvider("ollama", {
      baseUrl: settings.OLLAMA_BASE_URL,
      apiKey: "",
    });
    await testCompletionSmall(provider, settings.OLLAMA_MODEL);
    await testCompletionMed(provider, settings.OLLAMA_MODEL);
  }, 180_000);
});
