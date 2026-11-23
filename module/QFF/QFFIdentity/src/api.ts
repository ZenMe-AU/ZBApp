/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */
export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(status: number, message: string, fields?: Record<string, string>) { super(message); this.status = status; this.fields = fields; }
}

export async function api<T>(path: string, method = "GET", body?: unknown, revision?: string, timeoutMs = 15000): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(revision ? { "If-Match": revision } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ApiError(0, "We couldn't reach your profile. Check the connection and try again.");
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data?.error ?? "Your changes couldn't be saved. Please try again.", data?.fields);
  if (!data) throw new ApiError(0, "Your profile returned an unreadable response. Please try again.");
  return data as T;
}
