/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { readFileSync } from "node:fs";
import { expect } from "vitest";
import type { ILlmProvider, LlmCompletionMetrics } from "./contract.mjs";

export const providerSettings = () =>
  JSON.parse(
    readFileSync(new URL("../local.settings.json", import.meta.url), "utf8"),
  ).Values;

export async function testCompletionSmall(
  provider: ILlmProvider,
  model: string,
): Promise<void> {
  expect(
    model,
    `Configure the model for ${provider.name} in local.settings.json`,
  ).toBeTruthy();
  await provider.assertReady();
  let metrics: LlmCompletionMetrics | undefined;
  const result = await provider.completeJson<{ ok: boolean }>({
    systemPrompt:
      "Return the input object unchanged as JSON. No reasoning or other text.",
    input: { ok: true },
    model,
    schema: {
      type: "object",
      properties: { ok: { type: "boolean" } },
      required: ["ok"],
      additionalProperties: false,
    },
    options: { temperature: 0, effort: "low", thinking: false },
    onMetrics: (value) => {
      metrics = value;
    },
  });
  expect(result).toEqual({ ok: true });
  expect(metrics).toBeDefined();
  expect(Number.isFinite(metrics!.outputTokens)).toBe(true);
  expect(Number.isFinite(metrics!.elapsedMs)).toBe(true);
  expect(metrics!.outputTokens).toBeGreaterThan(0);
  expect(metrics!.elapsedMs).toBeGreaterThan(0);
  console.table([
    {
      provider: provider.name,
      model,
      outputTokens: metrics!.outputTokens,
      elapsedMs: Math.round(metrics!.elapsedMs),
      tokensPerSecond: Number(
        ((metrics!.outputTokens * 1000) / metrics!.elapsedMs).toFixed(2),
      ),
    },
  ]);
}

export async function testCompletionMed(
  provider: ILlmProvider,
  model: string,
): Promise<void> {
  expect(
    model,
    `Configure the model for ${provider.name} in local.settings.json`,
  ).toBeTruthy();
  await provider.assertReady();
  let metrics: LlmCompletionMetrics | undefined;
  const result = await provider.completeJson({
    systemPrompt:
      "For each task, sum its values. Return each task's id and sum, plus the sum of all task sums, as JSON. No reasoning or other text.",
    input: {
      tasks: [
        { id: "a", values: [4, 7, 9] },
        { id: "b", values: [12, 3, 5] },
        { id: "c", values: [6, 8, 11] },
        { id: "d", values: [10, 10, 2] },
        { id: "e", values: [15, 4, 1] },
      ],
    },
    model,
    schema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string" }, sum: { type: "number" } },
            required: ["id", "sum"],
            additionalProperties: false,
          },
        },
        total: { type: "number" },
      },
      required: ["results", "total"],
      additionalProperties: false,
    },
    options: { temperature: 0, effort: "low", thinking: false },
    onMetrics: (value) => {
      metrics = value;
    },
  });
  expect(result).toEqual({
    results: [
      { id: "a", sum: 20 },
      { id: "b", sum: 20 },
      { id: "c", sum: 25 },
      { id: "d", sum: 22 },
      { id: "e", sum: 20 },
    ],
    total: 107,
  });
  expect(metrics).toBeDefined();
  expect(Number.isFinite(metrics!.outputTokens)).toBe(true);
  expect(Number.isFinite(metrics!.elapsedMs)).toBe(true);
  expect(metrics!.outputTokens).toBeGreaterThan(0);
  expect(metrics!.elapsedMs).toBeGreaterThan(0);
  console.table([
    {
      provider: provider.name,
      model,
      outputTokens: metrics!.outputTokens,
      elapsedMs: Math.round(metrics!.elapsedMs),
      tokensPerSecond: Number(
        ((metrics!.outputTokens * 1000) / metrics!.elapsedMs).toFixed(2),
      ),
    },
  ]);
}
