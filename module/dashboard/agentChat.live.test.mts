/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sendLiveChat, startLiveChat } from "./agentChat.live.mjs";

let directory: string;
let runPath: string;
let bridge: Awaited<ReturnType<typeof startLiveChat>>;

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "q3-live-chat-"));
  runPath = path.join(directory, "run.chat.md");
  bridge = await startLiveChat(runPath, ["Ian"]);
});

afterEach(async () => {
  await bridge.close();
  await rm(directory, { recursive: true });
});

it("delivers a dashboard message at the agent turn boundary using its live state", async () => {
  const agent = { steps: 2, dashboardChat: [] as string[] };
  const result = sendLiveChat(runPath, "Ian", "Share questions with Jake");
  agent.steps = 3;
  await vi.waitFor(async () => {
    expect(
      await bridge.drain("Ian", async (message) => {
        agent.dashboardChat.push(message);
        return `I am on step ${agent.steps}`;
      })
    ).toBe(true);
  });
  await expect(result).resolves.toEqual({ answer: "I am on step 3" });
  expect(agent.dashboardChat).toEqual(["Share questions with Jake"]);
});

it("rejects offline and finished agents instead of simulating their persona", async () => {
  await expect(sendLiveChat(runPath, "Eric", "hello")).rejects.toThrow("offline");
  bridge.finish("Ian");
  await expect(sendLiveChat(runPath, "Ian", "hello")).rejects.toThrow("finished");
});

it("surfaces inference errors without closing the live agent endpoint", async () => {
  const result = sendLiveChat(runPath, "Ian", "hello");
  const rejected = expect(result).rejects.toThrow("inference failed");
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await vi.waitFor(async () => {
      expect(
        await bridge.drain("Ian", async () => {
          throw new Error("inference failed");
        })
      ).toBe(true);
    });
    await rejected;
    expect(errorLog).toHaveBeenCalled();
    await expect(sendLiveChat(runPath, "Eric", "hello")).rejects.toThrow("offline");
  } finally {
    errorLog.mockRestore();
  }
});

it("rejects unauthorized requests", async () => {
  const endpoint = JSON.parse(await readFile(`${runPath}.live.json`, "utf8"));
  const response = await fetch(endpoint.url, {
    method: "POST",
    body: JSON.stringify({ agent: "Ian", message: "hello" }),
  });
  expect(response.status).toBe(403);
  expect(await bridge.drain("Ian", async () => "unexpected")).toBe(false);
});

it("rejects duplicate queued messages while a reply is being generated", async () => {
  const first = sendLiveChat(runPath, "Ian", "first");
  await vi.waitFor(async () => {
    expect(
      await bridge.drain("Ian", async () => {
        await expect(sendLiveChat(runPath, "Ian", "duplicate")).rejects.toThrow("pending dashboard message");
        return "First reply";
      })
    ).toBe(true);
  });
  await expect(first).resolves.toEqual({ answer: "First reply" });
});
