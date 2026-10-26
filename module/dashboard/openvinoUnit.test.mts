/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { describe, expect, it } from "vitest";
import { OpenvinoProvider } from "./llmProvider/index.mjs";

describe("OpenVINO unit tests", () => {
  it("loads the selected model and generates structured JSON through its matching pipeline", async () => {
    const provider = new OpenvinoProvider();
    expect(
      provider.localModelDir,
      "Set LLM_MODEL or OPENVINO_MODEL_DIR to select the model under test.",
    ).toBeDefined();
    await provider.assertReady();
    const pipe = await provider.getPipeline();
    const { StructuredOutputConfig } = await import("openvino-genai-node");

    const schema = {
      type: "object",
      properties: { ok: { type: "boolean" } },
      required: ["ok"],
    };

    const structConfig = new StructuredOutputConfig({
      json_schema: JSON.stringify(schema),
    });
    const prompt =
      "<|im_start|>system\nReply with only one JSON object matching this schema:\n" +
      JSON.stringify(schema) +
      '<|im_end|>\n<|im_start|>user\nReturn {"ok":true}.<|im_end|>\n<|im_start|>assistant\n';

    const res = await pipe.generate(prompt, {
      max_new_tokens: 32,
      structured_output_config: structConfig,
    });

    const text = res.texts && res.texts[0] ? res.texts[0].trim() : "";
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    expect(firstBrace).toBeGreaterThanOrEqual(0);
    expect(lastBrace).toBeGreaterThanOrEqual(firstBrace);

    const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1));
    expect(parsed).toEqual({ ok: true });
  }, 180_000);
});
