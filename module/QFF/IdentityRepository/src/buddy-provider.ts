/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */
import { RequestError } from "./repository.ts";
import type { BuddyAvailability } from "./contracts.ts";

export interface BuddyProvider { complete(system: string, input: unknown): Promise<unknown> }
type Settings = { url: string; model: string; key: string; timeout: number };

export function buddySettings(env: NodeJS.ProcessEnv = process.env): Settings {
  if (env.QFF_AI_MODE !== "live") throw new RequestError(503, "Buddy is not connected on this workstation. Configure the AI connection to start chatting.");
  let url: URL;
  try { url = new URL(env.LLM_BASE_URL || ""); } catch { throw new RequestError(503, "The workstation AI endpoint is not configured correctly."); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!(url.protocol === "https:" || (loopback && url.protocol === "http:")) || url.username || url.password || url.search || url.hash) {
    throw new RequestError(503, "The workstation AI endpoint must use HTTPS, or HTTP on loopback, without URL credentials or query parameters.");
  }
  const timeout = Number(env.LLM_TIMEOUT_MS || "30000");
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000) throw new RequestError(503, "The workstation AI timeout must be between 1000 and 120000 milliseconds.");
  if (!env.LLM_MODEL?.trim() || (!loopback && !env.LLM_API_KEY?.trim())) throw new RequestError(503, "The workstation AI model or API key is missing.");
  const base = url.href.replace(/\/+$/, "");
  return { url: base.endsWith("/chat/completions") ? base : `${base}/chat/completions`, model: env.LLM_MODEL.trim(), key: env.LLM_API_KEY || "", timeout };
}

export function buddyAvailability(env = process.env): BuddyAvailability {
  try { buddySettings(env); return { available: true }; }
  catch (error) { return { available: false, reason: (error as Error).message }; }
}

// Uses the project's existing OpenAI-compatible wire format and workstation keys.
// Kept separate from dashboard orchestration: no strict-schema requirement or raw
// provider errors, and a bounded response/timeout for this interactive workflow.
export function openAICompatibleBuddy(env = process.env, fetchFn: typeof fetch = fetch): BuddyProvider {
  const settings = buddySettings(env);
  // DeepSeek enables thinking by default; Buddy needs short structured replies.
  const budget = new URL(settings.url).hostname === "api.deepseek.com"
    ? { thinking: { type: "disabled" }, max_tokens: 1536, response_format: { type: "json_object" } }
    : {};
  return { async complete(system, input) {
    try {
      const response = await fetchFn(settings.url, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(settings.timeout),
        headers: { "Content-Type": "application/json", ...(settings.key ? { Authorization: `Bearer ${settings.key}` } : {}) },
        body: JSON.stringify({ model: settings.model, ...budget, messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(input) }] }),
      });
      if (!response.ok) { await response.body?.cancel(); throw new RequestError(502, "Buddy's AI connection returned an error. Try again shortly."); }
      const reader = response.body?.getReader();
      if (!reader) throw new RequestError(502, "Buddy received an empty response. Please try again.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 32 * 1024) { await reader.cancel(); throw new RequestError(502, "Buddy's response was too large. Please try a shorter message."); }
        chunks.push(value);
      }
      const envelope = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (envelope?.choices?.[0]?.finish_reason === "length") throw new RequestError(502, "Buddy reached its reply limit. Your entry is saved; try asking about one topic at a time.");
      const content = envelope?.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("Missing content");
      return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch (error) {
      if (error instanceof RequestError) throw error;
      if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) throw new RequestError(504, "Buddy took too long to respond. Your message is still here; please try again.");
      throw new RequestError(502, "Buddy couldn't read the AI response. Please try again.");
    }
  } };
}
