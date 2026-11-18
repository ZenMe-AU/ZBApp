/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { createHash, randomUUID } from "node:crypto";
import { lstat, open, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

export const fixtureRoot = fileURLToPath(new URL("../../Identities/", import.meta.url));
const profileIdPattern = /^[a-z0-9_-]+$/i;
const guid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const kinds = ["interest", "want", "value", "boundary"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class RequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function profileIds(root = fixtureRoot) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter(entry => entry.isDirectory() && profileIdPattern.test(entry.name)).map(entry => entry.name).sort();
}

export async function resolveProfileFolder(id: string, root = fixtureRoot) {
  if (!profileIdPattern.test(id)) throw new RequestError(404, "Profile not found.");
  const folder = join(root, id);
  try {
    if ((await lstat(folder)).isDirectory()
      && basename(await realpath(folder)) === id
      && (await lstat(join(folder, `${id}-identity.json`))).isFile()) return folder;
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
  }
  throw new RequestError(404, "Profile not found.");
}

function parsePreferences(text: string, id: string) {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed) || parsed.identity_id !== id || !Array.isArray(parsed.preferences)) {
    throw new Error(`Invalid preferences fixture: ${id}`);
  }
  const preferences: Record<string, unknown>[] = [];
  for (const value of parsed.preferences) {
    if (!isRecord(value)) throw new Error(`Invalid preference in fixture: ${id}`);
    preferences.push(value);
  }
  return { ...parsed, preferences };
}

const etag = (text: string) => `"${createHash("sha256").update(text).digest("hex")}"`;

async function replaceJson(file: string, update: (original: string) => unknown | undefined) {
  const lockPath = `${file}.lock`;
  const lock = await open(lockPath, "wx").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw new RequestError(409, "A write is already in progress. Retry after reloading.");
    throw error;
  });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    const original = await readFile(file, "utf8");
    const next = update(original);
    if (next === undefined) return etag(original);
    const json = JSON.stringify(next, null, 2) + "\n";
    const text = original.includes("\r\n") ? json.replaceAll("\n", "\r\n") : json;
    await writeFile(temp, text, { flag: "wx" });
    await rename(temp, file);
    return etag(text);
  }
  finally {
    try {
      await rm(temp, { force: true });
    }
    finally {
      await lock.close();
      await rm(lockPath);
    }
  }
}

export async function migratePreferences(root = fixtureRoot) {
  for (const id of await profileIds(root)) {
    const folder = await resolveProfileFolder(id, root);
    await replaceJson(join(folder, `${id}-properties.json`), (original) => {
      const parsed = parsePreferences(original, id);
      let changed = false;
      const ids = new Set<string>();
      for (const key of ["embedding_model", "kind_vectors"]) {
        if (Object.hasOwn(parsed, key)) {
          Reflect.deleteProperty(parsed, key);
          changed = true;
        }
      }
      for (const preference of parsed.preferences) {
        for (const key of ["embedding", "embedding_text", "embedding_input", "embedding_model"]) {
          if (Object.hasOwn(preference, key)) {
            delete preference[key];
            changed = true;
          }
        }
        if (!Object.hasOwn(preference, "preference_id")) {
          preference.preference_id = randomUUID();
          changed = true;
        }
        const key = preference.preference_id;
        if (typeof key !== "string" || !guid.test(key) || ids.has(key.toLowerCase())) {
          throw new Error(`Invalid or duplicate preference GUID in fixture: ${id}`);
        }
        ids.add(key.toLowerCase());
      }
      return changed ? parsed : undefined;
    });
  }
}

export async function readProfile(folder: string, id: string) {
  const [identity, personas, relations, text] = await Promise.all(
    ["identity", "personas", "relations", "properties"].map(kind => readFile(join(folder, `${id}-${kind}.json`), "utf8")),
  );
  return {
    revision: etag(text),
    profile: {
      identity: JSON.parse(identity) as unknown,
      personas: JSON.parse(personas) as unknown,
      relations: JSON.parse(relations) as unknown,
      properties: parsePreferences(text, id),
    },
  };
}

export function updatePreference(folder: string, id: string, preferenceId: string, revision: string | null, input: unknown) {
  if (!revision) throw new RequestError(428, "Supply the properties revision in If-Match.");
  if (!guid.test(preferenceId)) throw new RequestError(400, "Invalid preference GUID.");
  if (
    !isRecord(input) || Object.keys(input).some(key => !["keyword", "definition", "kind", "personas"].includes(key))
    || typeof input.keyword !== "string" || !input.keyword.trim()
    || typeof input.definition !== "string" || !input.definition.trim()
    || typeof input.kind !== "string" || !kinds.includes(input.kind)
    || !Array.isArray(input.personas) || !input.personas.every((entry: unknown) => isRecord(entry)
      && Object.keys(entry).every(key => ["persona", "affinity"].includes(key))
      && typeof entry.persona === "string" && entry.persona.trim()
      && typeof entry.affinity === "number" && Number.isFinite(entry.affinity) && Math.abs(entry.affinity) <= 1)
  ) throw new RequestError(400, "Supply valid keyword, definition, kind and persona affinities.");

  return replaceJson(join(folder, `${id}-properties.json`), (original) => {
    if (etag(original) !== revision) throw new RequestError(412, "Preferences changed. Reload before saving.");
    const parsed = parsePreferences(original, id);
    const preference = parsed.preferences.find(record => record.preference_id === preferenceId);
    if (!preference) throw new RequestError(404, "Preference not found.");
    Object.assign(preference, input);
    return parsed;
  });
}
