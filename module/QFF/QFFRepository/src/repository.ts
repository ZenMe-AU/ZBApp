/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "@lancedb/lancedb";
import { Field, Float32, Float64, Int32, List, Schema, Utf8 } from "apache-arrow";

const assets = new URL("../../CanonicalModels/", import.meta.url);
export const datasetPath = fileURLToPath(new URL("../.data/", import.meta.url));

const types = {
  text: new Utf8(),
  number: new Float64(),
  integer: new Int32(),
  vector: new List(new Field("item", new Float32(), false)),
};

async function initialize(path: string) {
  const [schemaText, seedText] = await Promise.all([
    readFile(new URL("schema-v1.json", assets), "utf8"),
    readFile(new URL("seed-v1.json", assets), "utf8"),
  ]);
  const definitions = JSON.parse(schemaText) as Record<string, Record<string, keyof typeof types>>;
  const seed = JSON.parse(seedText) as { version: string, concepts: Record<string, unknown>[] };
  const db = await connect(path);
  const catalogueSchema = new Schema([new Field("version", types.text, false)]);
  await db.createTable("catalogue", [{ version: seed.version }], { schema: catalogueSchema, existOk: true });

  for (const [table, columns] of Object.entries(definitions)) {
    const schema = new Schema(Object.entries(columns).map(([name, type]) => {
      if (!Object.hasOwn(types, type)) throw new Error(`Unknown schema type: ${type}`);
      return new Field(name, types[type], true);
    }));
    if (table === "concepts" && seed.concepts.length) {
      await db.createTable(table, seed.concepts, { schema, existOk: true });
    }
    else {
      await db.createEmptyTable(table, schema, { existOk: true });
    }
  }
  return db;
}

type Database = Awaited<ReturnType<typeof connect>>;
export type IdentityPreferenceReference = {
  identity_id: string;
  preference_id: string;
  source_revision: string;
};

const datasetInitializations = new Map<string, ReturnType<typeof initialize>>();
const datasetWriters = new WeakMap<Database, Promise<void>>();

async function withDatasetWriter<T>(db: Database, action: () => Promise<T>): Promise<T> {
  const previous = datasetWriters.get(db) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  datasetWriters.set(db, previous.then(() => current));
  await previous;
  try {
    return await action();
  }
  finally {
    release();
  }
}

// ponytail: serialize bootstrap in the local worker; use a dedicated writer before enabling hosted writes.
let localDataset: ReturnType<typeof initialize> | undefined;

export function openDataset(path = datasetPath) {
  if (path === datasetPath) {
    localDataset ??= initialize(path).catch((error: unknown) => {
      localDataset = undefined;
      throw error;
    });
    return localDataset;
  }

  const key = resolve(path);
  const existing = datasetInitializations.get(key);
  if (existing) return existing;
  const pending = initialize(key);
  datasetInitializations.set(key, pending);
  return pending.finally(() => {
    if (datasetInitializations.get(key) === pending) datasetInitializations.delete(key);
  });
}

export async function syncIdentityPreferenceReferences(db: Database, references: IdentityPreferenceReference[]) {
  const unique = new Map<string, IdentityPreferenceReference>();
  for (const reference of references) {
    if (!reference.identity_id || !reference.preference_id || !reference.source_revision) {
      throw new Error("Identity preference references require IDs and a source revision.");
    }
    const key = `${reference.identity_id}\0${reference.preference_id}`;
    const existing = unique.get(key);
    if (existing && existing.source_revision !== reference.source_revision) {
      throw new Error(`Conflicting revisions for preference ${reference.preference_id}.`);
    }
    unique.set(key, reference);
  }
  if (!unique.size) return 0;

  return withDatasetWriter(db, async () => {
    const table = await db.openTable("identity_preference_refs");
    const rows = [...unique.values()];
    await table.mergeInsert(["identity_id", "preference_id"])
      .whenMatchedUpdateAll()
      .whenNotMatchedInsertAll()
      .execute(rows);
    return rows.length;
  });
}
