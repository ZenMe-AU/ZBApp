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
  await writeFile(path.join(dir, "embedding-kinds.json"), "{}");
  const data = {
    embedding_model: { name: "test", version: "1", dimensions: 2 },
    modes: {
      visit: {
        description: "Visit",
        vector: [9, 9],
        submodes: [
          { text: "attend", weight: 1, vector: [9, 9], embeddedText: "visit: attend" },
          { text: "gallery", weight: 3, vector: [9, 9], embeddedText: "visit: gallery" },
          { text: "candidate", weight: 0, vector: null, embeddedText: null },
        ],
      },
      spectate: { description: "Spectate", vector: null, submodes: [{ text: "attend", weight: 1, vector: [8, 8], embeddedText: "spectate: attend" }] },
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
  let result = run(true);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(file, "utf8"), original);
  result = run(false);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /0 to embed/);
  assert.match(result.stdout, /2 mode averages calculated offline/);
  const saved = JSON.parse(await readFile(file, "utf8"));
  assert.deepEqual(saved.modes.visit.vector, [0.25, 0.75]);
  assert.deepEqual(saved.modes.spectate.vector, [1, 0]);
  for (const mode of Object.values(saved.modes) as (typeof data.modes.visit)[]) {
    assert.ok(mode.submodes.every((s) => s.embeddedText === s.text));
  }
  assert.deepEqual(saved.modes.visit.submodes[0].vector, saved.modes.spectate.submodes[0].vector);
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
});
