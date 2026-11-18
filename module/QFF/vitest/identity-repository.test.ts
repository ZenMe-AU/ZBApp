/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProfile, profileIds, readProfile, resolveProfileFolder, updatePreference } from "../IdentityRepository/src/repository.ts";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function newRoot() {
  const root = await mkdtemp(join(tmpdir(), "qff-identity-vitest-"));
  temporaryRoots.push(root);
  return root;
}

function profile(id: string) {
  return {
    identity: { identity_id: id, name: "Test User" },
    personas: { identity_id: id, personas: [{ persona: "Friend" }] },
    relations: { identity_id: id, relations: [] },
    properties: {
      identity_id: id,
      preferences: [{ keyword: "walking", definition: "Walk for enjoyment", kind: "interest", personas: [] }],
    },
  };
}

describe("Identity Repository file lifecycle", () => {
  it("creates a profile, assigns a stable preference ID, and reads and updates its files", async () => {
    const root = await newRoot();
    const id = "NEW";
    await createProfile(id, profile(id), root);

    expect(await profileIds(root)).toEqual([id]);
    const folder = await resolveProfileFolder(id, root);
    const initial = await readProfile(folder, id);
    const preferenceId = initial.profile.properties.preferences[0].preference_id;
    expect(preferenceId).toMatch(/^[\da-f-]{36}$/);
    expect(initial.profile.identity).toEqual(profile(id).identity);
    expect(initial.profile.personas).toEqual(profile(id).personas);
    expect(JSON.parse(await readFile(join(folder, `${id}-test-context.json`), "utf8"))).toEqual(profile(id).personas);
    expect(JSON.parse(await readFile(join(folder, `${id}-properties.json`), "utf8"))).toEqual(initial.profile.properties);

    await updatePreference(folder, id, String(preferenceId), initial.revision, {
      keyword: "hiking",
      definition: "Walk on trails",
      kind: "interest",
      personas: [{ persona: "Friend", affinity: 0.8 }],
    });

    const updated = await readProfile(folder, id);
    expect(updated.revision).not.toBe(initial.revision);
    expect(updated.profile.properties.preferences[0]).toMatchObject({
      preference_id: preferenceId,
      keyword: "hiking",
      definition: "Walk on trails",
      personas: [{ persona: "Friend", affinity: 0.8 }],
    });
  });

  it("creates a profile without test context and saves an identity-wide boundary", async () => {
    const root = await newRoot();
    const id = "BASE";
    const { identity, relations, properties } = profile(id);
    await createProfile(id, { identity, relations, properties }, root);
    const folder = await resolveProfileFolder(id, root);
    const { profile: initial, revision } = await readProfile(folder, id);
    expect(initial).not.toHaveProperty("personas");
    const boundary = {
      keyword: "exact routines", definition: "Do not share precise routines", kind: "boundary",
      personas: [{ persona: "", affinity: -0.9 }],
    };
    await updatePreference(folder, id, String(initial.properties.preferences[0].preference_id), revision, boundary);
    expect((await readProfile(folder, id)).profile.properties.preferences[0]).toMatchObject(boundary);
  });

  it("does not lose updates when two writers race on the same revision", async () => {
    const root = await newRoot();
    const id = "RACE";
    await createProfile(id, profile(id), root);
    const folder = await resolveProfileFolder(id, root);
    const original = await readProfile(folder, id);
    const preferenceId = String(original.profile.properties.preferences[0].preference_id);
    const update = (keyword: string) => updatePreference(folder, id, preferenceId, original.revision, {
      keyword,
      definition: `Definition of ${keyword}`,
      kind: "interest",
      personas: [],
    });

    const outcomes = await Promise.allSettled([update("hiking"), update("cycling")]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find(result => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") expect([409, 412]).toContain(rejected.reason.status);

    const final = await readProfile(folder, id);
    expect(["hiking", "cycling"]).toContain(final.profile.properties.preferences[0].keyword);
  });

  it("atomically rejects concurrent creation of the same identity", async () => {
    const root = await newRoot();
    const input = profile("DUP");
    const outcomes = await Promise.allSettled([
      createProfile("DUP", input, root),
      createProfile("DUP", input, root),
    ]);

    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find(result => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") expect(rejected.reason.status).toBe(409);
    expect((await readProfile(await resolveProfileFolder("DUP", root), "DUP")).profile.properties.preferences).toHaveLength(1);
  });
});
