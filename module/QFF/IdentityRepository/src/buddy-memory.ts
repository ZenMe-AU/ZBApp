/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BuddyMemory, BuddyMemorySnapshot } from "./contracts.ts";
import { etag, replaceJson, RequestError } from "./repository.ts";

export const buddyMemoryLimit = 5 * 1024 * 1024;
const emptyMemory = (id: string): BuddyMemory => ({ version: 1, identity_id: id, conversations: [], proposals: [] });
const initialText = (id: string) => JSON.stringify(emptyMemory(id));
export const buddyFile = (folder: string, id: string) => join(folder, `${id}-buddy.json`);

function parseMemory(text: string, id: string): BuddyMemory {
  let value: BuddyMemory;
  try { value = JSON.parse(text); } catch { throw new RequestError(500, "Buddy memory could not be read. The saved file has been left unchanged."); }
  if (!value || value.version !== 1 || value.identity_id !== id || !Array.isArray(value.conversations) || !Array.isArray(value.proposals)
    || value.conversations.some(c => !c || typeof c.conversation_id !== "string" || !["chat", "diary"].includes(c.mode) || !Array.isArray(c.turns)
      || c.turns.some(t => !t || typeof t.request_id !== "string" || typeof t.content !== "string" || !["processing", "complete", "failed"].includes(t.status)))
    || value.proposals.some(p => !p || typeof p.proposal_id !== "string" || !["pending", "approved", "dismissed"].includes(p.status) || !p.preference)) {
    throw new RequestError(500, "Buddy memory has an unsupported format. The saved file has been left unchanged.");
  }
  return value;
}

export async function readBuddyMemory(folder: string, id: string): Promise<BuddyMemorySnapshot> {
  let text: string;
  try {
    if ((await stat(buddyFile(folder, id))).size > buddyMemoryLimit) throw new RequestError(413, "The Buddy memory file exceeds its supported size.");
    text = await readFile(buddyFile(folder, id), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    text = initialText(id);
  }
  return { revision: etag(text), memory: parseMemory(text, id) };
}

export async function updateBuddyMemory<T>(folder: string, id: string, update: (memory: BuddyMemory, revision: string) => T | Promise<T>) {
  let result!: T;
  await replaceJson(buddyFile(folder, id), async original => {
    const memory = parseMemory(original, id);
    result = await update(memory, etag(original));
    return memory;
  }, { initial: initialText(id), private: true, maxBytes: buddyMemoryLimit });
  return result;
}
