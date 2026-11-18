/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { ChildProcess, fork } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";
import { answerResults, readAgentMemory, greetingReply } from "./results-chat.mjs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  fork: vi.fn(),
}));
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

it("reads current personal memories without rewriting files, with legacy fallback only when no current files exist", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dashboard-memory-"));
  try {
    expect(await readAgentMemory(directory)).toBe("");
    await writeFile(path.join(directory, "memory.md"), "Legacy memory");
    expect(await readAgentMemory(directory)).toBe("Legacy memory");
    await mkdir(path.join(directory, "memory"));
    await writeFile(path.join(directory, "memory", "notes.txt"), "Ignore this");
    expect(await readAgentMemory(directory)).toBe("Legacy memory");
    await writeFile(path.join(directory, "memory", "Ian.md"), "Ian facts");
    await writeFile(path.join(directory, "memory", "Bella.md"), "Bella facts");
    expect(await readAgentMemory(directory)).toBe("Bella facts\n\nIan facts");
    expect(await readFile(path.join(directory, "memory.md"), "utf8")).toBe("Legacy memory");
    expect(await readFile(path.join(directory, "memory", "Bella.md"), "utf8")).toBe("Bella facts");
    await expect(readAgentMemory(path.join(directory, "memory.md"))).rejects.toMatchObject({ code: "ENOTDIR" });
  }
  finally {
    await rm(directory, { recursive: true, force: true });
  }
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

it("answers only standalone greetings locally, leaving substantive messages for inference", () => {
  for (const message of ["hi", " Hello! ", "hey...", "안녕", "안녕하세요!"]) expect(greetingReply(message)).toBeTruthy();
  for (const message of ["hi, why did Mike fail?", "highlight the issues", "안녕 오늘 결과는?", "", "what happened?"]) expect(greetingReply(message)).toBeUndefined();
  expect(fork).not.toHaveBeenCalled();
});
