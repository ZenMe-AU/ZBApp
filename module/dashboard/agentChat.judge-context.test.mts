/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { createJudgeContextBuilder, isAllowedJudgeApiPath } from "./agentChat.judge-context.mjs";

test("builds read-only evidence and expands history only when requested", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "judge-context-"));
  const dashboardDir = path.join(root, "module", "dashboard");
  for (const owner of ["Mike", "Bella", "Ian", "Eric"]) {
    await mkdir(path.join(dashboardDir, owner, "memory"), { recursive: true });
    await writeFile(path.join(dashboardDir, owner, "memory", "Mike.md"), `${owner} remembers surfing.`);
  }
  await writeFile(path.join(root, "question.ts"), 'export const question = "surfing";');
  await writeFile(path.join(root, "local.settings.json"), '{"API_KEY":"must-not-be-read"}');

  const activity = {
    listRuns: vi.fn(async () => [{ name: "run-2" }, { name: "run-1" }]),
    listByRun: vi.fn(async (runId) => [{ id: runId, eventData: { token: "secret", text: "surfing" } }]),
  };
  const readApi = vi.fn(async () => ({ authorization: "Bearer abc", questions: ["surfing"] }));
  const build = createJudgeContextBuilder({ dashboardDir, repositoryDir: root, activity, readApi });
  const context = await build({ runId: "run-1", question: "Review all history about surfing", apiRequests: [{ actor: "Mike", path: "/questions" }] });

  expect(context.scope).toBe("all-runs");
  expect(context.activity).toHaveLength(2);
  expect(context.activity[0].events[0].eventData.token).toBe("[redacted]");
  expect(context.memories).toHaveLength(4);
  expect(context.repository).toContainEqual(expect.objectContaining({ path: "question.ts", line: 1 }));
  expect(context.repository.some((item) => item.path.includes("local.settings"))).toBe(false);
  expect(context.api[0].data.authorization).toBe("[redacted]");
  expect(readApi).toHaveBeenCalledWith("Mike", "/questions");
});

test("keeps ordinary questions scoped to the selected run", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "judge-context-"));
  const activity = { listRuns: vi.fn(), listByRun: vi.fn(async () => []) };
  const build = createJudgeContextBuilder({ dashboardDir: root, repositoryDir: root, activity });

  const context = await build({ runId: "run-1", question: "Why did Ian miss this?" });

  expect(context.scope).toBe("selected-run");
  expect(activity.listRuns).not.toHaveBeenCalled();
});

test("allows only explicit read API paths", () => {
  expect(isAllowedJudgeApiPath("/questionQry/getQuestions")).toBe(true);
  expect(isAllowedJudgeApiPath("/question/q-1/answers")).toBe(true);
  expect(isAllowedJudgeApiPath("/question/q-1/answer")).toBe(false);
  expect(isAllowedJudgeApiPath("/question/q-1/share")).toBe(false);
  expect(isAllowedJudgeApiPath("/questions?admin=true")).toBe(false);
  expect(isAllowedJudgeApiPath("/../local.settings.json")).toBe(false);
});

test("rejects a write API before calling the reader", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "judge-context-"));
  const readApi = vi.fn();
  const activity = { listRuns: vi.fn(), listByRun: vi.fn(async () => []) };
  const build = createJudgeContextBuilder({ dashboardDir: root, repositoryDir: root, activity, readApi });

  await expect(build({ runId: "run-1", question: "Share this", apiRequests: [{ actor: "Mike", path: "/question/q-1/share" }] }))
    .rejects.toThrow("not allowed");
  expect(readApi).not.toHaveBeenCalled();
});
