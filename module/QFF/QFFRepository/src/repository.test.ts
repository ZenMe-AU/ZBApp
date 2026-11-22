/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDataset } from "./repository.ts";

test("bootstraps a disposable LanceDB dataset without resetting existing data", async (t) => {
  const path = await mkdtemp(join(tmpdir(), "qff-lance-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  const first = await openDataset(path);
  assert.deepEqual((await first.tableNames()).sort(), [
    "catalogue", "concepts", "identity_preference_refs", "mappings", "match_transactions", "runs", "vectors",
  ]);
  const runs = await first.openTable("runs");
  await runs.add([{ run_id: "example", status: "failed", details_json: "{}" }]);
  const reopened = await openDataset(path);
  const [run] = await (await reopened.openTable("runs")).query().toArray();
  assert.equal(run.run_id, "example");
  assert.equal(await (await reopened.openTable("catalogue")).countRows(), 1);
});
