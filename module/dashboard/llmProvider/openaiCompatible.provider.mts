/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { clip, type ILlmProvider, type LlmProviderConfig, type LlmRequest } from "./contract.mjs";

export interface OpenaiCompatibleProviderConfig extends LlmProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  fetchFn?: typeof fetch;
}

export class OpenaiCompatibleProvider implements ILlmProvider {
  readonly name: string;
  readonly config: OpenaiCompatibleProviderConfig;

  constructor(name: string = "openai", config: OpenaiCompatibleProviderConfig = {}) {
    this.name = name;
    this.config = config;
  }

  get baseUrl(): string | undefined {
    return this.config.baseUrl ?? process.env.LLM_BASE_URL;
  }

  get apiKey(): string | undefined {
    return this.config.apiKey ?? process.env.LLM_API_KEY;
  }

  get localModelDir(): string | undefined {
    return this.config.localModelDir;
  }

  get modelName(): string | undefined {
    return this.config.modelName;
  }

  private get fetchFn(): typeof fetch {
    return this.config.fetchFn ?? fetch;
  }

  async assertReady(): Promise<void> {
    if (!this.baseUrl) {
      throw new Error(`LLM_PROVIDER='${this.name}' requires 'LLM_BASE_URL' to be configured in local.settings.json or environment variables.`);
    }
  }

  async completeJson<TOutput = unknown>(request: LlmRequest): Promise<TOutput> {
    const startedAt = performance.now();
    const baseUrl = (this.baseUrl || "").replace(/\/$/, "");
    if (!baseUrl) {
      throw new Error(`LLM_PROVIDER='${this.name}' requires 'LLM_BASE_URL' to be configured.`);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers.authorization = `Bearer ${this.apiKey}`;
    }

    const res = await this.fetchFn(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: request.model,
        messages: [
          {
            role: "system",
            content: `${request.systemPrompt}\n\nReply with only one JSON object that matches this JSON Schema, no other text:\n${JSON.stringify(request.schema)}`,
          },
          { role: "user", content: JSON.stringify(request.input) },
        ],
        ...(request.schema && {
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "output",
              strict: true,
              schema: request.schema,
            },
          },
        }),
      }),
      signal: AbortSignal.timeout(3 * 60 * 1000),
    });

    const body = (await res.json().catch(() => null)) as
      | {
          error?: unknown;
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { completion_tokens?: number };
        }
      | null
      | undefined;
    if (!res.ok) {
      throw new Error(`LLM API ${res.status}: ${clip(JSON.stringify(body?.error ?? body), 300)}`);
    }
    if (typeof body?.usage?.completion_tokens === "number") {
      request.onMetrics?.({ outputTokens: body.usage.completion_tokens, elapsedMs: performance.now() - startedAt });
    }

    const text = body?.choices?.[0]?.message?.content ?? "";
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace < 0 || lastBrace < firstBrace) {
      throw new Error(`LLM reply is not JSON: ${clip(text, 200)}`);
    }
    const out = (() => {
      try {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1));
      } catch {
        throw new Error(`LLM reply is not JSON: ${clip(text, 200)}`);
      }
    })();

    if (request.schema?.required && Array.isArray(request.schema.required)) {
      const missing = request.schema.required.filter((key: string) => !(key in out));
      if (missing.length) throw new Error(`LLM reply misses ${missing.join(", ")}`);
    }

    return out as TOutput;
  }
}
