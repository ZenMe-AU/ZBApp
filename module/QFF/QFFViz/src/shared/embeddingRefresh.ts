/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { store } from "../data/store";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `Request failed: ${response.status}`);
  return body as T;
}

export async function refreshEmbeddings(dimensions: number, report: (text: string) => void): Promise<void> {
  await request("/api/embeddings", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dimensions, force: false, dryRun: false }),
  });
  while (true) {
    const job = await request<{ status: string, log: string[] }>("/api/embeddings");
    report(job.log.at(-1) ?? "Refreshing embeddings...");
    if (job.status === "failed") throw new Error(job.log.at(-1) ?? "Embedding refresh failed.");
    if (job.status === "succeeded") {
      await store.refreshAfterEmbeddings();
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
