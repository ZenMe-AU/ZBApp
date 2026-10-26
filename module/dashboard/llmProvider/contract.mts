/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

export interface LlmCompletionOptions {
  maxTokens?: number;
  temperature?: number;
  [key: string]: unknown;
}

export interface LlmJsonSchema {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface LlmRequest<TInput = unknown> {
  systemPrompt: string;
  input: TInput;
  model: string;
  schema: LlmJsonSchema;
  sandbox?: string;
  options?: LlmCompletionOptions;
  onMetrics?: (metrics: LlmCompletionMetrics) => void;
}

export interface LlmCompletionMetrics {
  outputTokens: number;
  elapsedMs: number;
}

export interface LlmProviderConfig {
  localModelDir?: string;
  modelName?: string;
  baseUrl?: string;
  apiKey?: string;
  [key: string]: unknown;
}

export interface ILlmProvider {
  readonly name: string;
  readonly config?: LlmProviderConfig;
  assertReady(): Promise<void>;
  completeJson<TOutput = unknown>(request: LlmRequest): Promise<TOutput>;
}

export const clip = (value: unknown, length: number): string => {
  const text = String(value);
  return text.length > length ? `${text.slice(0, length)}...` : text;
};
