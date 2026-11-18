/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, describe, expect, it } from "vitest";
import { fixtureRoot, profileIds, readProfile, resolveProfileFolder } from "../IdentityRepository/src/repository.ts";
import { openDataset, syncIdentityPreferenceReferences } from "../QFFRepository/src/repository.ts";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function newDatasetPath() {
  const root = await mkdtemp(join(tmpdir(), "qff-lancedb-vitest-"));
  temporaryRoots.push(root);
  return root;
}

async function fixtureReferences() {
  const identities = await profileIds();
  const profiles = await Promise.all(identities.map(async identityId => {
    const folder = await resolveProfileFolder(identityId);
    return { identityId, ...(await readProfile(folder, identityId)) };
  }));
  return {
    profiles,
    references: profiles.flatMap(({ identityId, revision, profile }) =>
      profile.properties.preferences.map(preference => ({
        identity_id: identityId,
        preference_id: String(preference.preference_id),
        source_revision: revision,
      }))),
  };
}

describe("QFF Repository identity reference index", () => {
  it("initializes safely when concurrent callers open a new dataset", async () => {
    const path = await newDatasetPath();
    const opened = await Promise.all(Array.from({ length: 8 }, () => openDataset(path)));
    expect(opened.every(db => db === opened[0])).toBe(true);
    expect((await opened[0].tableNames()).sort()).toContain("identity_preference_refs");
  });

  it("bulk-loads all identity preference references and reports repository performance", async () => {
    const path = await newDatasetPath();
    const sourceStarted = performance.now();
    const { profiles, references } = await fixtureReferences();
    const sourceReadMs = performance.now() - sourceStarted;
    expect(profiles.length).toBeGreaterThan(0);
    expect(references.length).toBeGreaterThan(0);

    const db = await openDataset(path);
    const writeStarted = performance.now();
    await syncIdentityPreferenceReferences(db, references);
    const writeMs = performance.now() - writeStarted;
    const verifyStarted = performance.now();
    const rows = await (await db.openTable("identity_preference_refs")).query().toArray();
    const verifyMs = performance.now() - verifyStarted;

    expect(rows).toHaveLength(references.length);
    expect(new Set(rows.map(row => `${row.identity_id}:${row.preference_id}`)).size).toBe(references.length);
    expect(rows.map(row => row.identity_id).sort()).toEqual(references.map(row => row.identity_id).sort());

    const totalMs = sourceReadMs + writeMs + verifyMs;
    const metrics = {
      profiles: profiles.length,
      preferences: references.length,
      sourceReadMs: Number(sourceReadMs.toFixed(2)),
      writeMs: Number(writeMs.toFixed(2)),
      verifyMs: Number(verifyMs.toFixed(2)),
      totalMs: Number(totalMs.toFixed(2)),
      writeRowsPerSecond: Number((references.length / Math.max(writeMs / 1000, 0.001)).toFixed(2)),
      identityFixturePath: fixtureRoot,
    };
    const metricsPath = process.env.QFF_PERFORMANCE_METRICS_FILE ?? join(tmpdir(), "qff-repository-performance.json");
    await mkdir(dirname(metricsPath), { recursive: true });
    await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`);
  });

  it("serializes concurrent upserts without duplicate references and updates revisions", async () => {
    const { references } = await fixtureReferences();
    const db = await openDataset(await newDatasetPath());

    await Promise.all(Array.from({ length: 8 }, () => syncIdentityPreferenceReferences(db, references)));
    let rows = await (await db.openTable("identity_preference_refs")).query().toArray();
    expect(rows).toHaveLength(references.length);

    const refreshed = references.map(reference => ({ ...reference, source_revision: "refreshed-revision" }));
    await syncIdentityPreferenceReferences(db, refreshed);
    rows = await (await db.openTable("identity_preference_refs")).query().toArray();
    expect(rows).toHaveLength(references.length);
    expect(rows.every(row => row.source_revision === "refreshed-revision")).toBe(true);

    await expect(syncIdentityPreferenceReferences(db, [
      references[0],
      { ...references[0], source_revision: "conflicting-revision" },
    ])).rejects.toThrow("Conflicting revisions");
  });
});
