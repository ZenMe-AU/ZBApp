/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { describe, expect, it, vi } from "vitest";
import { type ILlmProvider, type LlmRequest, OpenaiCompatibleProvider } from "./index.mjs";

export function registerCompatibleProviderMocks(providerName: string): void {
  describe(`${providerName} provider`, () => {
    describe("mocked backend", () => {
      it("rejects an unready backend and accepts a ready backend", async () => {
        const unreadyProvider: ILlmProvider = new OpenaiCompatibleProvider(providerName, {
          baseUrl: "",
        });
        await expect(unreadyProvider.assertReady()).rejects.toThrow(/requires 'LLM_BASE_URL' to be configured/);

        const readyProvider: ILlmProvider = new OpenaiCompatibleProvider(providerName, {
          baseUrl: "http://localhost:11434/v1",
        });
        await expect(readyProvider.assertReady()).resolves.toBeUndefined();
      });

      it("returns structured JSON and reports output metrics", async () => {
        let capturedUrl = "";
        let capturedOptions: RequestInit | undefined;

        const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
          capturedUrl = url;
          capturedOptions = init;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      answer: "mocked success",
                      count: 42,
                    }),
                  },
                },
              ],
              usage: { completion_tokens: 8 },
            }),
          };
        }) as unknown as typeof fetch;

        const provider: ILlmProvider = new OpenaiCompatibleProvider(providerName, {
          baseUrl: "https://api.example.com/v1/",
          apiKey: "test-token",
          fetchFn: mockFetch,
        });

        const request: LlmRequest = {
          systemPrompt: "You are a test helper",
          input: { query: "hello" },
          model: "qwen2.5-coder:3b",
          schema: {
            type: "object",
            properties: {
              answer: { type: "string" },
              count: { type: "number" },
            },
            required: ["answer", "count"],
          },
        };
        const onMetrics = vi.fn();
        request.onMetrics = onMetrics;

        const result = await provider.completeJson<{
          answer: string;
          count: number;
        }>(request);

        expect(capturedUrl).toBe("https://api.example.com/v1/chat/completions");
        expect(capturedOptions?.method).toBe("POST");
        expect((capturedOptions?.headers as Record<string, string>)?.authorization).toBe("Bearer test-token");
        expect(result).toEqual({ answer: "mocked success", count: 42 });
        expect(onMetrics).toHaveBeenCalledWith(expect.objectContaining({ outputTokens: 8 }));
      });

      it("propagates backend failures", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
          json: async () => ({ error: { message: "Service Unavailable" } }),
        }) as unknown as typeof fetch;

        const provider: ILlmProvider = new OpenaiCompatibleProvider(providerName, {
          baseUrl: "https://api.example.com/v1",
          fetchFn: mockFetch,
        });

        const request: LlmRequest = {
          systemPrompt: "System",
          input: "Input",
          model: "model-a",
          schema: { type: "object", properties: { ok: { type: "boolean" } } },
        };

        await expect(provider.completeJson(request)).rejects.toThrow(/LLM API 503/);
      });

      it("mock - throws error when response misses required schema fields", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
          }),
        }) as unknown as typeof fetch;

        const provider: ILlmProvider = new OpenaiCompatibleProvider(providerName, {
          baseUrl: "http://localhost:11434/v1",
          fetchFn: mockFetch,
        });

        const request: LlmRequest = {
          systemPrompt: "System",
          input: "Input",
          model: "model-b",
          schema: {
            type: "object",
            properties: {
              ok: { type: "boolean" },
              requiredField: { type: "string" },
            },
            required: ["requiredField"],
          },
        };

        await expect(provider.completeJson(request)).rejects.toThrow(/LLM reply misses requiredField/);
      });
    });
  });
}
