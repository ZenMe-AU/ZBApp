/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, test, vi } from "vitest";
import { answerRefereeChat, normaliseRefereeHistory } from "./referee-chat.mjs";

test("keeps only bounded user and assistant history", () => {
  const history = Array.from({ length: 15 }, (_, index) => ({ role: index === 0 ? "system" : index % 2 ? "user" : "assistant", content: "x".repeat(5000) }));
  const result = normaliseRefereeHistory(history);
  expect(result).toHaveLength(12);
  expect(result.every((item) => item.role !== "system" && item.content.length === 4000)).toBe(true);
});

test("returns interpretation separately from its evidence inventory", async () => {
  const infer = vi.fn(async (request) => {
    expect(request.systemPrompt).toContain("read-only Referee");
    expect(request.input.evidence.activity[0].events).toHaveLength(250);
    return { answer: "Ian missed the evidence." };
  });
  const context = {
    scope: "selected-run",
    activity: [{ runId: "run-1", events: Array.from({ length: 300 }, (_, index) => ({ id: `event-${index}` })) }],
    memories: [{ owner: "Ian", subject: "Mike", path: "Ian/memory/Mike.md", content: "Known facts" }],
    repository: [{ path: "module/file.mts", line: 4, text: "evidence" }],
    api: [{ actor: "Ian", path: "/questions", data: [] }],
  };

  const result = await answerRefereeChat({ message: "Why?", history: [], context, model: "referee", env: {} }, infer);

  expect(result.answer).toBe("Ian missed the evidence.");
  expect(result.evidence).toEqual({
    scope: "selected-run",
    activity: [{ runId: "run-1", eventIds: Array.from({ length: 300 }, (_, index) => `event-${index}`) }],
    memories: [{ owner: "Ian", subject: "Mike", path: "Ian/memory/Mike.md" }],
    repository: [{ path: "module/file.mts", line: 4 }],
    api: [{ actor: "Ian", path: "/questions" }],
  });
});
