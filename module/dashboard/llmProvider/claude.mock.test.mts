/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// Run from parent folder: pnpm exec vitest run llmProvider/claude.mock.test.mts

import { describe, expect, it, vi } from "vitest";
import {
  type ILlmProvider,
  type LlmRequest,
  ClaudeProvider,
} from "./index.mjs";

describe("ClaudeProvider", () => {
  describe("mocked backend", () => {
    it("rejects an unready backend and accepts a ready backend", async () => {
      const mockLoggedOutRunner = vi.fn().mockResolvedValue({
        stdout: JSON.stringify({ loggedIn: false }),
      });

      const unreadyProvider: ILlmProvider = new ClaudeProvider({
        binPath: "claude",
        runner: mockLoggedOutRunner,
      });

      await expect(unreadyProvider.assertReady()).rejects.toThrow(
        /Claude CLI is not logged in/,
      );

      const mockLoggedInRunner = vi.fn().mockResolvedValue({
        stdout: JSON.stringify({ loggedIn: true }),
      });

      const readyProvider: ILlmProvider = new ClaudeProvider({
        binPath: "claude",
        runner: mockLoggedInRunner,
      });

      await expect(readyProvider.assertReady()).resolves.toBeUndefined();
    });

    it("returns structured JSON and reports output metrics", async () => {
      let capturedArgs: string[] = [];
      let capturedInput: string | undefined;

      const mockRunner = vi
        .fn()
        .mockImplementation(
          async (
            _file: string,
            args: string[],
            options: { input?: string },
          ) => {
            capturedArgs = args;
            capturedInput = options.input;
            return {
              stdout: JSON.stringify({
                is_error: false,
                structured_output: { success: true, notes: "processed" },
                usage: { output_tokens: 8 },
              }),
            };
          },
        );

      const provider: ILlmProvider = new ClaudeProvider({
        binPath: "claude-mock",
        runner: mockRunner,
      });

      const onMetrics = vi.fn();
      const request: LlmRequest = {
        systemPrompt: "System instruction",
        onMetrics,
        input: { data: 123 },
        model: "claude-3-5-sonnet",
        schema: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            notes: { type: "string" },
          },
          required: ["success"],
        },
        sandbox: "sandbox/dir",
        options: { effort: "high", thinking: true },
      };

      const result = await provider.completeJson<{
        success: boolean;
        notes: string;
      }>(request);

      expect(capturedArgs).toContain("-p");
      expect(capturedArgs).toContain("--system-prompt");
      expect(capturedArgs).toContain("System instruction");
      expect(capturedArgs).toContain("--model");
      expect(capturedArgs).toContain("claude-3-5-sonnet");
      expect(capturedArgs).toContain("--effort");
      expect(capturedArgs).toContain("high");
      expect(capturedArgs).toContain("--output-format");
      expect(capturedArgs).toContain("json");
      expect(capturedInput).toBe(JSON.stringify({ data: 123 }));
      expect(result).toEqual({ success: true, notes: "processed" });
      expect(onMetrics).toHaveBeenCalledWith({
        outputTokens: 8,
        elapsedMs: expect.any(Number),
      });
    });

    it("propagates backend failures", async () => {
      const mockRunner = vi.fn().mockRejectedValue({
        code: 1,
        stdout: JSON.stringify({ result: "Process crash" }),
      });

      const provider: ILlmProvider = new ClaudeProvider({
        binPath: "claude",
        runner: mockRunner,
      });

      const request: LlmRequest = {
        systemPrompt: "System",
        input: "Input",
        model: "claude-3-5-haiku",
        schema: { type: "object", properties: { ok: { type: "boolean" } } },
      };

      await expect(provider.completeJson(request)).rejects.toThrow(
        /claude exited 1/,
      );
    });
  });
});
