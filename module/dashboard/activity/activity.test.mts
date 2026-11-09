/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createActivityStore } from "./activity-store.mjs";
import { activityAggregate } from "./activity-event.mjs";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Activity LanceDB store", () => {
  test("stores structured events by run and deduplicates stable event IDs", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "activity-test-"));
    directories.push(directory);
    const store = createActivityStore(path.join(directory, "activity.lancedb"), path.join(directory, "spool.jsonl"));
    const event = await store.record("run.chat.md", {
      id: "event-1",
      eventType: "question.created",
      kind: "question",
      questionId: "question-1",
      eventData: { title: "Location" },
    });

    await store.repository.append(event);

    const events = await store.repository.listByRun("run.chat.md");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: "event-1", questionId: "question-1", eventData: { title: "Location" } });
    expect(events[0].correlationId).toHaveLength(32);
    await expect(store.repository.listRuns()).resolves.toEqual([{ name: "run.chat.md", mtime: Date.parse(event.occurredAt) }]);
  });

  test("maps events to their top-level DDD aggregate root", () => {
    const base = { runId: "run-1", aggregateType: null, aggregateId: null, actorType: "agent" as const, actorProfileId: "agent-1", actorName: "Ian", questionId: null };
    expect(activityAggregate({ ...base, eventType: "agent.finding" })).toEqual({ aggregateType: "agent", aggregateId: "agent-1" });
    expect(activityAggregate({ ...base, eventType: "run.completed", actorType: "system", actorProfileId: null, actorName: null })).toEqual({ aggregateType: "run", aggregateId: "run-1" });
    expect(activityAggregate({ ...base, eventType: "answer.sent", aggregateType: "answer", aggregateId: "answer-1", questionId: "question-1" })).toEqual({ aggregateType: "question", aggregateId: "question-1" });
    expect(activityAggregate({ ...base, eventType: "agent.memory_updated", aggregateType: "memory", aggregateId: null })).toEqual({ aggregateType: "agent", aggregateId: "agent-1" });
  });
});
