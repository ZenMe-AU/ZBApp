/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

test("cache-only refresh migrates inputs and averages automatically; dry run changes nothing", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "qff-refresh-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const qff = fileURLToPath(new URL("../../../", import.meta.url));
  const viz = path.join(dir, "QFFViz");
  const server = path.join(viz, "src", "server");
  await mkdir(server, { recursive: true });
  await mkdir(path.join(dir, "Identities"));
  await mkdir(path.join(viz, ".cache"));
  await cp(path.join(qff, "interest-modes.ts"), path.join(dir, "interest-modes.ts"));
  for (const name of ["embeddings.ts", "files.ts"]) {
    await cp(path.join(qff, "QFFViz", "src", "server", name), path.join(server, name));
  }
  await symlink(path.join(qff, "QFFViz", "node_modules"), path.join(viz, "node_modules"), "junction");
  await writeFile(path.join(viz, "embedding.config.json"), JSON.stringify({ endpoint: "http://127.0.0.1:1", deployment: "test" }));
  await writeFile(path.join(dir, "embedding-kinds.json"), JSON.stringify({ interest: "A topic" }));
  const personDir = path.join(dir, "Identities", "Test");
  await mkdir(personDir);
  const preferencesFile = path.join(personDir, "T-properties.json");
  const properties = {
    embedding_model: { name: "test", version: "1", dimensions: 2 },
    personas: [
      { persona: "first", preferences: [{ keyword: "shared", definition: "First meaning", kind: "interest", embedding: [9, 9] }] },
      { persona: "second", preferences: [{ keyword: "shared", definition: "Second meaning", kind: "interest", embedding: [0, 1] }] },
    ],
    kind_vectors: { interest: [1, 1] },
  };
  await writeFile(preferencesFile, JSON.stringify(properties));
  const data = {
    embedding_model: { name: "test", version: "1", dimensions: 2 },
    modes: {
      visit: {
        definition: "Visit",
        vector: [9, 9],
        submodes: [
          { text: "attend", definition: "Visit a venue.", weight: 1, vector: [9, 9] },
          { text: "gallery", definition: "Visit a gallery.", weight: 3, vector: [9, 9] },
          { text: "candidate", definition: "Explore a venue.", weight: 0, vector: null },
        ],
      },
      spectate: { definition: "Spectate", vector: null, submodes: [{ text: "attend", definition: "Watch a show.", weight: 1, vector: [8, 8] }] },
    },
  };
  const file = path.join(dir, "interest-modes.json");
  await writeFile(file, JSON.stringify(data));
  await writeFile(
    path.join(viz, ".cache", "embeddings.json"),
    JSON.stringify({
      "test|2|attend": [1, 0],
      "test|2|gallery": [0, 1],
      "test|2|candidate": [0.5, 0.5],
      "test|2|Visit a venue.": [1, 0],
      "test|2|Visit a gallery.": [0, 1],
      "test|2|Explore a venue.": [0.5, 0.5],
      "test|2|Watch a show.": [0, 1],
      "test|2|shared": [9, 9],
      "test|2|First meaning": [1, 0],
      "test|2|Second meaning": [0, 1],
      "test|2|interest: A topic": [1, 1],
    })
  );
  const run = (dryRun: boolean) =>
    spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {runEmbeddings} from './src/server/embeddings.ts'; await runEmbeddings({dimensions:2,force:false,dryRun:${dryRun}}, console.log);`,
      ],
      { cwd: viz, encoding: "utf8" }
    );
  const original = await readFile(file, "utf8");
  const originalPreferences = await readFile(preferencesFile, "utf8");
  let result = run(true);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(file, "utf8"), original);
  assert.equal(await readFile(preferencesFile, "utf8"), originalPreferences);
  result = run(false);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /0 to embed/);
  assert.match(result.stdout, /2 mode averages calculated offline/);
  const savedPreferences = JSON.parse(await readFile(preferencesFile, "utf8"));
  assert.deepEqual(savedPreferences.personas[0].preferences[0].embedding, [1, 0]);
  assert.deepEqual(savedPreferences.personas[1].preferences[0].embedding, [0, 1]);
  const saved = JSON.parse(await readFile(file, "utf8"));
  assert.deepEqual(saved.modes.visit.vector, [0.25, 0.75]);
  assert.deepEqual(saved.modes.spectate.vector, [0, 1]);
  for (const mode of Object.values(saved.modes) as (typeof data.modes.visit)[]) {
    assert.ok(mode.submodes.every((s) => !('embeddedText' in s)));
  }
  assert.notDeepEqual(saved.modes.visit.submodes[0].vector, saved.modes.spectate.submodes[0].vector);
  assert.deepEqual(
    saved.modes.visit.submodes.map((s: { weight: number }) => s.weight),
    [1, 3, 0]
  );
  assert.deepEqual(saved.modes.visit.submodes[2].vector, [0.5, 0.5]);

  saved.modes.visit.vector = null;
  await writeFile(file, JSON.stringify(saved));
  result = run(false);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")).modes.visit.vector, [0.25, 0.75]);

  saved.modes.visit.submodes[0].definition = "A changed definition.";
  await writeFile(file, JSON.stringify(saved));
  const staleModes = spawnSync(process.execPath, [
    "--input-type=module", "-e",
    "import {embeddingStatus, modesEditorData} from './src/server/embeddings.ts'; console.log(JSON.stringify({status: await embeddingStatus(), data: (await modesEditorData()).data}));",
  ], { cwd: viz, encoding: "utf8" });
  assert.equal(staleModes.status, 0, staleModes.stderr);
  const staleResult = JSON.parse(staleModes.stdout);
  assert.ok(staleResult.status.staleModes.some((item: { mode: string }) => item.mode === "visit"));
  assert.equal(staleResult.data.modes.visit.submodes[0].vector, null);
  assert.equal(staleResult.data.modes.visit.vector, null);
  saved.modes.visit.submodes[0].definition = "Visit a venue.";
  await writeFile(file, JSON.stringify(saved));

  savedPreferences.personas[0].preferences[0].definition = "Changed meaning";
  await writeFile(preferencesFile, JSON.stringify(savedPreferences));
  const status = spawnSync(process.execPath, [
    "--input-type=module", "-e",
    "import {embeddingStatus} from './src/server/embeddings.ts'; console.log(JSON.stringify(await embeddingStatus()));",
  ], { cwd: viz, encoding: "utf8" });
  assert.equal(status.status, 0, status.stderr);
  assert.deepEqual(JSON.parse(status.stdout).stale.map((item: { persona: string }) => item.persona), ["first"]);
  savedPreferences.personas[0].preferences[0].definition = "  ";
  await writeFile(preferencesFile, JSON.stringify(savedPreferences));
  result = run(true);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing definition for "shared".*first/);
});
