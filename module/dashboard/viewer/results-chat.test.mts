/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { ChildProcess, fork } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";
import { answerResults } from "./results-chat.mjs";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  fork: vi.fn(),
}));
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

it("returns results only after the inference process exits and releases its model", async () => {
  const child = mockChild();
  const promise = answerResults(request, {});
  let finished = false;
  void promise.then(() => {
    finished = true;
  });
  child.emit("message", { answer: "Run complete" });
  await Promise.resolve();
  expect(finished).toBe(false);
  child.emit("exit", 0, null);
  await expect(promise).resolves.toEqual({ answer: "Run complete" });
});

it("surfaces a native inference crash without crashing the caller", async () => {
  const child = mockChild();
  const promise = answerResults(request, {});
  const rejected = expect(promise).rejects.toThrow("exit -1073741571");
  child.emit("exit", -1073741571, null);
  await rejected;
});

it("kills timed-out results inference and waits for exit", async () => {
  vi.useFakeTimers();
  const child = mockChild();
  const promise = answerResults(request, {});
  const rejected = expect(promise).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(200_000);
  expect(child.kill).toHaveBeenCalledTimes(1);
  child.emit("exit", null, "SIGTERM");
  await rejected;
});

const request = {
  systemPrompt: "Reply with JSON",
  input: {},
  model: "",
  schema: { type: "object" },
};

function mockChild() {
  const child = Object.assign(new ChildProcess(), {
    send: vi.fn().mockReturnValue(true),
    kill: vi.fn().mockReturnValue(true),
  });
  vi.mocked(fork).mockReturnValue(child);
  return child;
}
