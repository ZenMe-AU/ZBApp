/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { LlmRequest } from "../llmProvider/contract.mjs";

type Reply = { answer: string } | { error: string };

// This is only the post-run results assistant. Live participant chat stays in the harness.
export async function answerResults(request: LlmRequest, env: NodeJS.ProcessEnv): Promise<{ answer: string }> {
  return new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(import.meta.url), ["--results-worker"], {
      env,
      execArgv: [],
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    let reply: Reply | undefined;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 200_000);
    child.once("message", (message: Reply) => {
      reply = message;
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error("Results assistant timed out."));
      else if (code !== 0 || !reply) reject(new Error(`Results inference process failed (exit ${code}, signal ${signal ?? "none"}). See inference logs.`));
      else if ("error" in reply) reject(new Error(reply.error));
      else resolve(reply);
    });
    child.send(request, (error) => {
      if (error) {
        child.kill();
        clearTimeout(timer);
        reject(error);
      }
    });
  });
}

if (process.argv.includes("--results-worker")) {
  process.once("message", async (request: LlmRequest) => {
    let reply: Reply;
    try {
      const { getProviderInstance } = await import("../agentChat.llm.mjs");
      const provider = getProviderInstance();
      await provider.assertReady();
      const result = await provider.completeJson<{ answer: string }>(request);
      if (typeof result?.answer !== "string" || !result.answer.trim()) throw new Error("Results assistant returned no answer.");
      reply = result;
    } catch (error) {
      reply = { error: error instanceof Error ? error.message : String(error) };
    }
    process.send!(reply, (error) => {
      if (error) console.error("Could not return results reply:", error);
      process.exit(error ? 1 : 0);
    });
  });
}
