/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Preference, PreferenceInput } from "./contracts.ts";
import { newPreferenceDuplicate, samePreference, similarPreferences } from "./buddy-preferences.ts";
import { preferenceErrors, trimmedPreference, type FieldErrors } from "./preference-validation.ts";

export const fixtureRoot = process.env.QFF_IDENTITY_ROOT
  ? resolve(process.env.QFF_IDENTITY_ROOT)
  : fileURLToPath(new URL("../../Identities/", import.meta.url));
const profileIdPattern = /^[a-z0-9_-]+$/i;
const guid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class RequestError extends Error {
  status: number;
  fields?: FieldErrors;

  constructor(status: number, message: string, fields?: FieldErrors) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export function resolveFixtureIdentityId(externalId: unknown, status = 404) {
  if (typeof externalId !== "string" || !profileIdPattern.test(externalId)) {
    throw new RequestError(status, status === 404 ? "Profile not found." : "Supply a valid external_id.");
  }
  return externalId;
}

export async function createFixtureProfile(input: unknown, root = fixtureRoot) {
  if (!isRecord(input)) throw new RequestError(400, "Supply a profile object.");
  const identityId = resolveFixtureIdentityId(input.external_id, 400);
  const documents: Record<string, unknown> = {};
  const keys = ["identity", "relations", "properties"];
  if (Object.hasOwn(input, "personas")) keys.push("personas");
  for (const key of keys) {
    const document = input[key];
    if (!isRecord(document) || Object.hasOwn(document, "external_id")) {
      throw new RequestError(400, `Supply a ${key} object; external_id belongs at the request root.`);
    }
    if (Object.hasOwn(document, "identity_id") && document.identity_id !== identityId) {
      throw new RequestError(400, `The ${key} identity_id must match the resolved identity ID.`);
    }
    documents[key] = { ...document, identity_id: identityId };
  }
  await createProfile(identityId, documents, root);
  return identityId;
}

export async function profileIds(root = fixtureRoot) {
  const entries = await readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
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

export const etag = (text: string) => `"${createHash("sha256").update(text).digest("hex")}"`;

export async function replaceJson(file: string, update: (original: string) => unknown | Promise<unknown>, options: { initial?: string; private?: boolean; maxBytes?: number } = {}) {
  const lockPath = `${file}.lock`;
  const lock = await open(lockPath, "wx").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw new RequestError(409, "A write is already in progress. Retry after reloading.");
    throw error;
  });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    const original = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT" && options.initial !== undefined) return options.initial;
      throw error;
    });
    const next = await update(original);
    if (next === undefined) return etag(original);
    const json = JSON.stringify(next, null, 2) + "\n";
    const text = original.includes("\r\n") ? json.replaceAll("\n", "\r\n") : json;
    if (options.maxBytes && Buffer.byteLength(text) > options.maxBytes) throw new RequestError(413, "Buddy memory is full. Delete older conversations or diary entries before adding more.");
    await writeFile(temp, text, { flag: "wx", ...(options.private ? { mode: 0o600 } : {}) });
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
  const read = (kind: string) => readFile(join(folder, `${id}-${kind}.json`), "utf8");
  const [identity, relations, text, testContext, buddyMemory] = await Promise.all([
    read("identity"), read("relations"), read("properties"),
    read("test-context").catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    }),
    read("buddy").catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    }),
  ]);
  return {
    revision: etag(text),
    identity_revision: etag(identity),
    profile_revision: etag(JSON.stringify([identity, relations, text, testContext ?? null, ...(buddyMemory === undefined ? [] : [buddyMemory])])),
    profile: {
      identity: JSON.parse(identity) as unknown,
      ...(testContext === undefined ? {} : { personas: JSON.parse(testContext) as unknown }),
      relations: JSON.parse(relations) as unknown,
      properties: parsePreferences(text, id),
    },
  };
}

export async function createProfile(id: string, input: unknown, root = fixtureRoot) {
  if (!profileIdPattern.test(id)) throw new RequestError(400, "Invalid profile ID.");
  if (!isRecord(input)) throw new RequestError(400, "Supply identity, relations and properties objects.");
  const required = ["identity", "relations", "properties"];
  for (const key of Object.hasOwn(input, "personas") ? [...required, "personas"] : required) {
    const document = input[key];
    if (!isRecord(document) || document.identity_id !== id) {
      throw new RequestError(400, `The ${key} identity_id must match the profile ID.`);
    }
  }

  const properties = parsePreferences(JSON.stringify(input.properties), id);
  const preferenceIds = new Set<string>();
  for (const preference of properties.preferences) {
    if (!Object.hasOwn(preference, "preference_id")) preference.preference_id = randomUUID();
    const preferenceId = preference.preference_id;
    if (typeof preferenceId !== "string" || !guid.test(preferenceId) || preferenceIds.has(preferenceId.toLowerCase())) {
      throw new RequestError(400, "Preferences must have unique GUID IDs.");
    }
    preferenceIds.add(preferenceId.toLowerCase());
  }

  await mkdir(root, { recursive: true });
  const temporary = join(root, `.create-${randomUUID()}`);
  const target = join(root, id);
  await mkdir(temporary);
  try {
    const documents = {
      identity: input.identity,
      ...(Object.hasOwn(input, "personas") ? { "test-context": input.personas } : {}),
      relations: input.relations,
      properties,
    };
    for (const [kind, value] of Object.entries(documents)) {
      await writeFile(join(temporary, `${id}-${kind}.json`), `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    }
    try {
      await rename(temporary, target);
    }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EEXIST" || code === "ENOTEMPTY" || code === "EPERM") {
        try {
          await lstat(target);
          throw new RequestError(409, "Profile already exists.");
        }
        catch (targetError) {
          if (targetError instanceof RequestError) throw targetError;
          if ((targetError as NodeJS.ErrnoException).code !== "ENOENT") throw targetError;
        }
      }
      throw error;
    }
  }
  finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export function validatePreference(input: unknown): asserts input is PreferenceInput {
  const fields = preferenceErrors(input);
  if (Object.keys(fields).length) throw new RequestError(400, Object.values(fields)[0], fields);
}

function rejectDuplicate(input: PreferenceInput, preferences: Preference[], current?: Preference) {
  const duplicate = newPreferenceDuplicate(input, preferences, current);
  if (duplicate) {
    const message = `“${duplicate.keyword}” already has the same title or description in this Category and Context. Edit the existing preference instead.`;
    throw new RequestError(409, message, { keyword: message });
  }
}

export function updatePreference(folder: string, id: string, preferenceId: string, revision: string | null, input: unknown) {
  if (!revision) throw new RequestError(428, "Supply the properties revision in If-Match.");
  if (!guid.test(preferenceId)) throw new RequestError(400, "Invalid preference GUID.");
  validatePreference(input);

  return replaceJson(join(folder, `${id}-properties.json`), (original) => {
    if (etag(original) !== revision) throw new RequestError(412, "Preferences changed. Reload before saving.");
    const parsed = parsePreferences(original, id);
    const preference = parsed.preferences.find(record => record.preference_id === preferenceId);
    if (!preference) throw new RequestError(404, "Preference not found.");
    const clean = trimmedPreference(input);
    rejectDuplicate(clean, parsed.preferences as unknown as Preference[], preference as unknown as Preference);
    Object.assign(preference, clean);
    if (input.kind !== "want") delete preference.want_type;
    return parsed;
  });
}

export async function addPreference(folder: string, id: string, revision: string | null, input: unknown) {
  if (!revision) throw new RequestError(428, "Supply the properties revision in If-Match.");
  validatePreference(input);
  const preference_id = randomUUID();
  const next = await replaceJson(join(folder, `${id}-properties.json`), original => {
    if (etag(original) !== revision) throw new RequestError(412, "Preferences changed. Reload before saving.");
    const parsed = parsePreferences(original, id);
    const clean = trimmedPreference(input);
    rejectDuplicate(clean, parsed.preferences as unknown as Preference[]);
    parsed.preferences.push({ ...clean, preference_id });
    return parsed;
  });
  return { preference_id, revision: next };
}

export async function commitBuddyApproval(folder: string, id: string, revision: string, proposalId: string,
  input: PreferenceInput, sourceId?: string, acknowledgeSimilar = false) {
  validatePreference(input);
  let preference_id: string = randomUUID();
  const next = await replaceJson(join(folder, `${id}-properties.json`), original => {
    const parsed = parsePreferences(original, id);
    const preferences = parsed.preferences as unknown as Preference[];
    const accepted = preferences.find(p => p.buddy_approval?.proposal_id === proposalId);
    if (accepted) { preference_id = accepted.preference_id; return undefined; }
    if (etag(original) !== revision) throw new RequestError(412, "Your preferences changed. Review the latest profile before approving this recommendation.");
    const source = sourceId ? preferences.find(p => p.preference_id === sourceId && !p.superseded_by) : undefined;
    if (sourceId && !source) throw new RequestError(409, "The original preference is no longer active. Request a fresh proposal.");
    const active = preferences.filter(p => !p.superseded_by && p.preference_id !== sourceId);
    if (active.some(p => samePreference(input, p))) throw new RequestError(409, "This preference is already saved. Dismiss this proposal.");
    if (similarPreferences(input, active).length && !acknowledgeSimilar) throw new RequestError(409, "Review the similar preferences and confirm this is a separate preference.");
    if (source) source.superseded_by = preference_id;
    parsed.preferences.push({ ...trimmedPreference(input), preference_id, ...(sourceId ? { supersedes: sourceId } : {}),
      buddy_approval: { proposal_id: proposalId, approved_at: new Date().toISOString() } });
    return parsed;
  });
  return { preference_id, revision: next };
}

export function deletePreference(folder: string, id: string, preferenceId: string, revision: string | null) {
  if (!revision) throw new RequestError(428, "Supply the properties revision in If-Match.");
  if (!guid.test(preferenceId)) throw new RequestError(400, "Invalid preference GUID.");
  return replaceJson(join(folder, `${id}-properties.json`), original => {
    if (etag(original) !== revision) throw new RequestError(412, "Preferences changed. Reload before deleting.");
    const parsed = parsePreferences(original, id);
    const index = parsed.preferences.findIndex(p => p.preference_id === preferenceId);
    if (index < 0) throw new RequestError(404, "Preference not found.");
    parsed.preferences.splice(index, 1);
    return parsed;
  });
}

export function updateIdentity(folder: string, id: string, revision: string | null, input: unknown) {
  if (!revision) throw new RequestError(428, "Supply the identity revision in If-Match.");
  const textFields = ["name", "gender", "location", "occupation", "summary"];
  if (!isRecord(input) || !Object.keys(input).length
    || Object.keys(input).some(key => ![...textFields, "age", "details"].includes(key))) {
    throw new RequestError(400, "Supply editable identity fields only.");
  }
  for (const key of textFields) {
    if (Object.hasOwn(input, key) && input[key] !== null
      && (typeof input[key] !== "string" || input[key].length > (key === "summary" ? 4000 : 200))) {
      throw new RequestError(400, `Invalid ${key}.`);
    }
  }
  if (Object.hasOwn(input, "age") && input.age !== null
    && (typeof input.age !== "number" || !Number.isInteger(input.age) || input.age < 0 || input.age > 150)) {
    throw new RequestError(400, "Age must be a whole number from 0 to 150, or empty.");
  }
  if (Object.hasOwn(input, "details") && (!Array.isArray(input.details) || input.details.length > 50
    || !input.details.every((d: unknown) => isRecord(d) && Object.keys(d).every(k => ["label", "value"].includes(k))
      && typeof d.label === "string" && !!d.label.trim() && d.label.length <= 120
      && typeof d.value === "string" && !!d.value.trim() && d.value.length <= 4000))) {
    throw new RequestError(400, "Supply up to 50 personal details with a label and value.");
  }
  return replaceJson(join(folder, `${id}-identity.json`), original => {
    if (etag(original) !== revision) throw new RequestError(412, "Profile information changed. Reload before saving.");
    const identity = JSON.parse(original);
    if (!isRecord(identity) || identity.identity_id !== id) throw new Error("Invalid identity document.");
    for (const [key, value] of Object.entries(input)) {
      if (value === null || value === "") delete identity[key];
      else identity[key] = value;
    }
    return identity;
  });
}

export async function deleteProfile(folder: string, id: string, revision: string | null) {
  if (!revision) throw new RequestError(428, "Supply the whole-profile revision in If-Match.");
  // Lock the same files as other writers before checking and removing the profile.
  const locks: Array<{ name: string; handle: Awaited<ReturnType<typeof open>> }> = [];
  let currentFolder = folder;
  try {
    for (const kind of ["identity", "properties", "relations", "test-context", "buddy"]) {
      const name = `${id}-${kind}.json.lock`;
      const handle = await open(join(folder, name), "wx").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "EEXIST") throw new RequestError(409, "A write is in progress. Reload before deleting.");
        throw error;
      });
      locks.push({ name, handle });
    }
    if ((await readProfile(folder, id)).profile_revision !== revision) {
      throw new RequestError(412, "Profile changed. Reload before deleting.");
    }
    // Remove it from discovery atomically; never recursively remove a user-supplied path.
    const removed = join(dirname(folder), `.deleted-${id}-${randomUUID()}`);
    await rename(folder, removed);
    currentFolder = removed;
    await rm(removed, { recursive: true, force: true });
  } finally {
    for (const lock of locks) {
      await lock.handle.close();
      await rm(join(currentFolder, lock.name), { force: true });
    }
  }
}
