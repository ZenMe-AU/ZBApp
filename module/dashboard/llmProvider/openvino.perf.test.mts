// Run from parent folder: pnpm exec vitest run llmProvider/openvino.perf.test.mts

import { describe, it } from "vitest";
import { OpenvinoProvider } from "./openvino.provider.mjs";
import {
  providerSettings,
  testCompletionMed,
  testCompletionSmall,
} from "./perftestHelper.mjs";

describe("OpenVINO provider (in-process)", () => {
  it("quick integration and performance", async () => {
    const settings = providerSettings();
    const model = settings.OPENVINO_MODEL_DIR ?? settings.LLM_MODEL;
    const provider = new OpenvinoProvider({
      localModelDir: model,
      device: settings.OPENVINO_DEVICE ?? "GPU",
    });
    await testCompletionSmall(provider, model);
    await testCompletionMed(provider, model);
  }, 180_000);
});
