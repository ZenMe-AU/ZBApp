/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { addPreference, createFixtureProfile, deletePreference, deleteProfile, profileIds, readProfile, resolveProfileFolder, updateIdentity, updatePreference, validatePreference, RequestError } from "./repository.ts";

async function setup(t: { after(fn: () => Promise<unknown>): void }) {
  const root = await mkdtemp(join(tmpdir(), "qff-editor-unit-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await createFixtureProfile({ external_id: "TEST", identity: { name: "Test", personas: [{ name: "Existing", description: "Preserve this" }], provenance: "untouched" }, properties: { preferences: [] }, relations: { relations: [] } }, root);
  const folder = await resolveProfileFolder("TEST", root);
  return { root, folder, read: () => readProfile(folder, "TEST") };
}
const input = { keyword: "Test preference", definition: "User-entered text", kind: "interest", personas: [{ persona: "", affinity: -0.7 }, { persona: "Work", affinity: 0.4 }] };

test("manual additions and edits reject normalized duplicates without losing distinct contexts or existing data", async t => {
  const { folder, read } = await setup(t);
  const original = { keyword: "curiosity", definition: "Learning about ideas", kind: "value", personas: [{ persona: "", affinity: 0.7 }] };
  const first = await addPreference(folder, "TEST", (await read()).revision, original);
  const before = await read();
  for (const duplicate of [
    { ...original, keyword: "  Curiosity  ", definition: "Other wording" },
    { ...original, keyword: "Different title", definition: "LEARNING about ideas" },
  ]) await assert.rejects(addPreference(folder, "TEST", before.revision, duplicate), error => {
    assert(error instanceof RequestError); assert.equal(error.status, 409); assert(error.fields!.keyword.includes("Category and Context")); return true;
  });
  assert.deepEqual(await read(), before);
  const separate = await addPreference(folder, "TEST", before.revision, { ...original, keyword: "Another value", definition: "A separate principle" });
  const beforeEdit = await read();
  assert.throws(() => validatePreference({ ...original, keyword: "   " }), error => error instanceof RequestError && error.status === 400 && !!error.fields?.keyword);
  await assert.rejects(updatePreference(folder, "TEST", separate.preference_id, beforeEdit.revision, original), { status: 409 });
  assert.deepEqual(await read(), beforeEdit);
  await updatePreference(folder, "TEST", first.preference_id, beforeEdit.revision, { ...original, keyword: " Curiosity ", definition: "Updated description" });
  assert.equal((await read()).profile.properties.preferences[0].keyword, "Curiosity");
  await addPreference(folder, "TEST", (await read()).revision, { ...original, personas: [{ persona: " Outdoors ", affinity: 0.7 }] });
  await addPreference(folder, "TEST", (await read()).revision, { ...original, personas: [{ persona: "", affinity: -0.7 }] });
  assert.equal((await read()).profile.properties.preferences.length, 4);
  assert.deepEqual((await read()).profile.properties.preferences[2].personas, [{ persona: "Outdoors", affinity: 0.7 }]);
});

test("validation identifies the actual fields using editor terminology", () => {
  assert.throws(() => validatePreference({ ...input, keyword: " ", definition: "\n", personas: [{ persona: " Work ", affinity: 1 }, { persona: "work", affinity: 0.5 }] }), error => {
    assert(error instanceof RequestError); assert(error.fields); assert.equal(error.status, 400);
    assert.match(error.fields.keyword, /Title/); assert.match(error.fields.definition, /Description/);
    assert.match(error.fields["personas.0.persona"], /Context/); assert.match(error.fields["personas.1.persona"], /Context/);
    return true;
  });
});

test("existing duplicate source records remain editable without accepting additional duplicates", async t => {
  const { root } = await setup(t);
  const value = { ...input, keyword: "curiosity", kind: "value" };
  await createFixtureProfile({ external_id: "LEGACY", identity: {}, properties: { preferences: [value, { ...value, definition: "Places and nature" }] }, relations: {} }, root);
  const folder = await resolveProfileFolder("LEGACY", root);
  const before = await readProfile(folder, "LEGACY");
  await updatePreference(folder, "LEGACY", String(before.profile.properties.preferences[0].preference_id), before.revision, { ...value, definition: "Updated by the owner" });
  const after = await readProfile(folder, "LEGACY");
  assert.equal(after.profile.properties.preferences.length, 2);
  assert.deepEqual(after.profile.properties.preferences[1], before.profile.properties.preferences[1]);
  await assert.rejects(addPreference(folder, "LEGACY", after.revision, { ...value, keyword: "Curiosity" }), { status: 409 });
});

test("creates, reads, updates and deletes preferences without losing IDs or signed contexts", async t => {
  const { folder, read } = await setup(t);
  const initial = await read();
  const added = await addPreference(folder, "TEST", initial.revision, input);
  assert.match(added.preference_id, /^[\da-f-]{36}$/);
  assert.deepEqual((await read()).profile.properties.preferences, [{ ...input, preference_id: added.preference_id }]);
  await assert.rejects(addPreference(folder, "TEST", initial.revision, input), { status: 412 });
  await updatePreference(folder, "TEST", added.preference_id, added.revision, { ...input, keyword: "Updated" });
  const updated = await read();
  assert.equal(updated.profile.properties.preferences[0].preference_id, added.preference_id);
  assert.deepEqual(updated.profile.properties.preferences[0].personas, input.personas);
  await assert.rejects(deletePreference(folder, "TEST", added.preference_id, initial.revision), { status: 412 });
  await deletePreference(folder, "TEST", added.preference_id, updated.revision);
  assert.deepEqual((await read()).profile.properties.preferences, []);
  assert.deepEqual((await read()).profile.identity, initial.profile.identity);
});

test("profile edits have their own revision, preserve unrelated fields, and remove cleared information", async t => {
  const { folder, read } = await setup(t);
  const initial = await read();
  await updateIdentity(folder, "TEST", initial.identity_revision, { name: "Edited", age: 25, details: [{ label: "My own field", value: "Free text" }] });
  const updated = await read();
  assert.equal(updated.revision, initial.revision, "identity changes do not invalidate properties edits");
  assert.notEqual(updated.profile_revision, initial.profile_revision);
  assert.deepEqual(updated.profile.identity, { ...(initial.profile.identity as object), name: "Edited", age: 25, details: [{ label: "My own field", value: "Free text" }] });
  await assert.rejects(updateIdentity(folder, "TEST", initial.identity_revision, { summary: "Stale" }), { status: 412 });
  await updateIdentity(folder, "TEST", updated.identity_revision, { name: null, age: null, details: [] });
  const cleared = (await read()).profile.identity as Record<string, unknown>;
  assert(!Object.hasOwn(cleared, "name")); assert(!Object.hasOwn(cleared, "age"));
  assert.equal(cleared.provenance, "untouched");
});

test("rejects malformed inputs and server-owned identity changes without writes", async t => {
  const { folder, read } = await setup(t);
  const initial = await read();
  for (const invalid of [
    { ...input, keyword: " " }, { ...input, definition: "x".repeat(4001) }, { ...input, kind: "goal" },
    { ...input, personas: [{ persona: "Work", affinity: 2 }] },
    { ...input, personas: [{ persona: "Work", affinity: 1 }, { persona: "work", affinity: -1 }] },
    { ...input, embedding: [1] }, { ...input, kind: "want", want_type: ["goal"] },
  ]) await assert.rejects(addPreference(folder, "TEST", initial.revision, invalid), { status: 400 });
  for (const invalid of [{ identity_id: "OTHER" }, { age: -1 }, { details: [{ label: "", value: "text" }] }, { personas: [] }]) {
    assert.throws(() => updateIdentity(folder, "TEST", initial.identity_revision, invalid), { status: 400 });
  }
  await assert.rejects(addPreference(folder, "TEST", null, input), { status: 428 });
  assert.throws(() => updateIdentity(folder, "TEST", null, { name: "Changed" }), { status: 428 });
  assert.deepEqual(await read(), initial);
});

test("concurrent add and edit use the same file lock and never overwrite each other", async t => {
  const { folder, read } = await setup(t);
  const a = await addPreference(folder, "TEST", (await read()).revision, input);
  const outcomes = await Promise.allSettled([
    addPreference(folder, "TEST", a.revision, { ...input, keyword: "A distinct preference", definition: "A distinct description" }),
    updatePreference(folder, "TEST", a.preference_id, a.revision, { ...input, keyword: "Changed" }),
  ]);
  assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1);
  const failure = outcomes.find(r => r.status === "rejected");
  assert(failure?.status === "rejected" && [409, 412].includes(failure.reason.status));
});

test("profile deletion checks the entire profile, respects active writers, and removes only that profile", async t => {
  const { root, folder, read } = await setup(t);
  await createFixtureProfile({ external_id: "KEEP", identity: {}, properties: { preferences: [] }, relations: { relations: [] } }, root);
  const initial = await read();
  await addPreference(folder, "TEST", initial.revision, input);
  await assert.rejects(deleteProfile(folder, "TEST", initial.profile_revision), { status: 412 });
  await writeFile(join(folder, "TEST-properties.json.lock"), "owned by another writer");
  await assert.rejects(deleteProfile(folder, "TEST", (await read()).profile_revision), { status: 409 });
  assert.equal(await readFile(join(folder, "TEST-properties.json.lock"), "utf8"), "owned by another writer");
  assert(!(await readdir(folder)).includes("TEST-identity.json.lock"));
  await rm(join(folder, "TEST-properties.json.lock"));
  await deleteProfile(folder, "TEST", (await read()).profile_revision);
  assert.deepEqual(await profileIds(root), ["KEEP"]);
  assert.deepEqual(await readdir(root), ["KEEP"]);
});
