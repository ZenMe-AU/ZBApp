/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { migratePreferences, profileIds, readProfile, resolveProfileFolder, updatePreference } from "./repository.ts";

test("resolves only the directory named for the requested profile ID", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "qff-identity-layout-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const folder = join(root, "EX");
  const legacy = join(root, "Example Profile");
  await mkdir(folder);
  await mkdir(legacy);
  for (const file of [join(folder, "EX-identity.json"), join(legacy, "EX-identity.json"), join(legacy, "OLD-identity.json")]) {
    await writeFile(file, "{}");
  }
  assert.deepEqual(await profileIds(root), ["EX"]);
  assert.equal(await resolveProfileFolder("EX", root), folder);
  for (const id of ["OLD", "ex", "../EX"]) {
    await assert.rejects(resolveProfileFolder(id, root), { status: 404 });
  }
});

test("migrates only vector fields and keeps stable IDs across revision-checked edits", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "qff-identity-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const folder = join(root, "EX");
  await mkdir(folder);
  for (const kind of ["identity", "personas", "relations"]) {
    await writeFile(join(folder, `EX-${kind}.json`), JSON.stringify({ identity_id: "EX" }));
  }
  const input = {
    keyword: "walking",
    definition: "Go for a walk",
    kind: "interest",
    personas: [{ persona: "outdoor friend", affinity: -0.5 }],
  };
  const file = join(folder, "EX-properties.json");
  await writeFile(file, JSON.stringify({
    identity_id: "EX",
    embedding_model: { name: "test" },
    kind_vectors: { interest: [1] },
    preferences: [{ ...input, embedding: [1], provenance: "fixture" }],
  }));
  await migratePreferences(root);
  const firstText = await readFile(file, "utf8");
  await migratePreferences(root);
  assert.equal(await readFile(file, "utf8"), firstText);
  const first = await readProfile(folder, "EX");
  const [preference] = first.profile.properties.preferences;
  const id = preference.preference_id;
  assert.ok(typeof id === "string");
  assert.match(id, /^[\da-f-]{36}$/);
  assert.deepEqual(first.profile.properties, {
    identity_id: "EX",
    preferences: [{ ...input, provenance: "fixture", preference_id: id }],
  });
  assert.throws(() => updatePreference(folder, "EX", id, first.revision, { ...input, embedding: [1] }), { status: 400 });
  await updatePreference(folder, "EX", id, first.revision, { ...input, keyword: "hiking" });
  await assert.rejects(updatePreference(folder, "EX", id, first.revision, input), { status: 412 });
  assert.deepEqual((await readProfile(folder, "EX")).profile.properties.preferences, [
    { ...input, keyword: "hiking", provenance: "fixture", preference_id: id },
  ]);
});
