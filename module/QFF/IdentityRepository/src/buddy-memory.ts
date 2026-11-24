/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BuddyMemory, BuddyMemorySnapshot, SavedBuddyProposal } from "./contracts.ts";
import { etag, replaceJson, RequestError } from "./repository.ts";

export const buddyMemoryLimit = 5 * 1024 * 1024;
const emptyMemory = (id: string): BuddyMemory => ({ version: 1, identity_id: id, conversations: [], proposals: [] });
const initialText = (id: string) => JSON.stringify(emptyMemory(id));
export const buddyFile = (folder: string, id: string) => join(folder, `${id}-buddy.json`);
export const buddyArchiveFile = (folder: string, id: string) => join(folder, `${id}-buddy-archive.json`);
const isArchived = (p: SavedBuddyProposal) => p.status === "archived" || p.status === "dismissed";
const emptyArchive = (id: string) => ({ version: 1, identity_id: id, proposals: [] as SavedBuddyProposal[] });

function parseMemory(text: string, id: string): BuddyMemory {
  let value: BuddyMemory;
  try { value = JSON.parse(text); } catch { throw new RequestError(500, "Buddy memory could not be read. The saved file has been left unchanged."); }
  if (!value || value.version !== 1 || value.identity_id !== id || !Array.isArray(value.conversations) || !Array.isArray(value.proposals)
    || value.conversations.some(c => !c || typeof c.conversation_id !== "string" || !["chat", "diary"].includes(c.mode) || !Array.isArray(c.turns)
      || c.turns.some(t => !t || typeof t.request_id !== "string" || typeof t.content !== "string" || !["processing", "complete", "failed"].includes(t.status)))
    || value.proposals.some(p => !p || typeof p.proposal_id !== "string" || !["pending", "approved", "archived", "dismissed"].includes(p.status) || !p.preference
      || (p.archived_at !== undefined && typeof p.archived_at !== "string"))) {
    throw new RequestError(500, "Buddy memory has an unsupported format. The saved file has been left unchanged.");
  }
  return value;
}

async function readText(file: string, initial: string) {
  let text: string;
  try {
    if ((await stat(file)).size > buddyMemoryLimit) throw new RequestError(413, "The Buddy memory file exceeds its supported size.");
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    text = initial;
  }
  return text;
}

function parseArchive(text: string, id: string) {
  let value;
  try { value = JSON.parse(text); } catch { throw new RequestError(500, "Buddy archive could not be read. The saved file has been left unchanged."); }
  const archive = parseMemory(JSON.stringify({ ...value, conversations: [] }), id);
  if (archive.proposals.some(p => !isArchived(p))) throw new RequestError(500, "Buddy archive has an unsupported format. The saved file has been left unchanged.");
  return { version: archive.version, identity_id: id, proposals: archive.proposals };
}

function snapshot(original: string, archived: string, id: string): BuddyMemorySnapshot {
  const memory = parseMemory(original, id);
  const archive = parseArchive(archived, id);
  // The archive wins if a process stopped after saving it but before cleaning up memory.
  const proposals = new Map(memory.proposals.map(p => [p.proposal_id, p]));
  for (const p of archive.proposals) proposals.set(p.proposal_id, p);
  memory.proposals = [...proposals.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { revision: etag(JSON.stringify([original, archived])), memory };
}

export async function readBuddyMemory(folder: string, id: string): Promise<BuddyMemorySnapshot> {
  // Read memory first: archive writes always precede removal from memory.
  const original = await readText(buddyFile(folder, id), initialText(id));
  const archived = await readText(buddyArchiveFile(folder, id), JSON.stringify(emptyArchive(id)));
  const result = snapshot(original, archived, id);
  if (parseMemory(original, id).proposals.some(isArchived)) {
    await updateBuddyMemory(folder, id, () => {});
    return readBuddyMemory(folder, id);
  }
  return result;
}

export async function updateBuddyMemory<T>(folder: string, id: string, update: (memory: BuddyMemory, revision: string) => T | Promise<T>) {
  let result!: T;
  await replaceJson(buddyFile(folder, id), async original => {
    const archiveFile = buddyArchiveFile(folder, id);
    const archived = await readText(archiveFile, JSON.stringify(emptyArchive(id)));
    const { memory, revision } = snapshot(original, archived, id);
    result = await update(memory, revision);
    const archive = { version: 1, identity_id: id, proposals: memory.proposals.filter(isArchived) };
    const active = { ...memory, proposals: memory.proposals.filter(p => !isArchived(p)) };
    for (const value of [archive, active]) {
      if (Buffer.byteLength(JSON.stringify(value, null, 2) + "\n") > buddyMemoryLimit) throw new RequestError(413, "Buddy memory is full.");
    }
    if (JSON.stringify(archive) !== JSON.stringify(parseArchive(archived, id))) {
      await replaceJson(archiveFile, () => archive, { initial: JSON.stringify(emptyArchive(id)), private: true, maxBytes: buddyMemoryLimit });
    }
    return active;
  }, { initial: initialText(id), private: true, maxBytes: buddyMemoryLimit });
  return result;
}
