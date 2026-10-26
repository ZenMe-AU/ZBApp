/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// Run from parent folder: pnpm exec vitest run llmProvider/claude.perf.test.mts

import { describe, it } from "vitest";
import { ClaudeProvider } from "./claude.provider.mjs";
import {
  providerSettings,
  testCompletionMed,
  testCompletionSmall,
} from "./perftestHelper.mjs";

describe("Claude provider", () => {
  it("quick integration and performance", async () => {
    const settings = providerSettings();
    const provider = new ClaudeProvider();
    await testCompletionSmall(provider, settings.CLAUDE_MODEL);
    await testCompletionMed(provider, settings.CLAUDE_MODEL);
  }, 180_000);
});
