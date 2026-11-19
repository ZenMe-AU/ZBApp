/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { expect, it } from "vitest";
import { datasetJobs, entityKey, readLineage } from "../src/lineage.ts";

const source = { namespace: "qff", name: "source" };
const dataset = { namespace: "qff", name: "references" };
const producer = { namespace: "qff", name: "index" };
const consumer = { namespace: "qff", name: "derive" };
const event = (fields: object) => JSON.stringify({
  eventTime: "2026-11-19T01:00:00Z", eventType: "START",
  job: producer, run: { runId: "first" }, ...fields,
});

it("orders events, combines dataset edges within each run, and follows namespaced dataset links", () => {
  const { jobs, errors } = readLineage({
    "complete.json": event({ eventTime: "2026-11-19T01:01:00Z", eventType: "COMPLETE", outputs: [dataset, dataset] }),
    "start.json": event({ inputs: [source] }),
    "next.json": event({ run: { runId: "second" }, inputs: [dataset] }),
    "consumer.json": event({ job: consumer, inputs: [dataset] }),
    "other-namespace.json": event({ job: { ...consumer, namespace: "other" }, inputs: [{ ...dataset, namespace: "other" }] }),
  });
  const runs = jobs.get(entityKey(producer))?.runs;
  expect(errors).toEqual([]);
  expect(runs?.get("first")?.sources.map(source => source.path)).toEqual(["start.json", "complete.json"]);
  expect(runs?.get("first")).toMatchObject({ inputs: [source], outputs: [dataset] });
  expect(runs?.get("second")).toMatchObject({ inputs: [dataset], outputs: [] });
  expect(datasetJobs(jobs, dataset)).toEqual({ producers: [producer], consumers: [producer, consumer] });
});

it("reports malformed files without blocking valid runs", () => {
  const { jobs, errors } = readLineage({
    "broken.json": "{",
    "wrong-shape.json": event({ inputs: [{ name: "missing namespace" }] }),
    "valid.json": event({}),
  });
  expect([...jobs.keys()]).toEqual([entityKey(producer)]);
  expect(errors.map(error => error.split(":")[0])).toEqual(["broken.json", "wrong-shape.json"]);
});
