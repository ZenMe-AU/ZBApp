/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { appendFile, readFile, writeFile } from "node:fs/promises";
import { createActivityEvent, newCorrelationId, type ActivityEvent, type ActivityEventInput, type ActivityKind } from "./activity-event.mjs";
import { createActivityRepository } from "./activity-repository.mjs";

type RecordInput = Partial<ActivityEventInput> & Pick<ActivityEventInput, "eventType"> & { kind: ActivityKind };

export function createActivityStore(databasePath: string, spoolPath: string) {
  const repository = createActivityRepository(databasePath);

  async function appendOrSpool(event: ActivityEvent) {
    try {
      await repository.append(event);
    } catch (error) {
      try {
        await appendFile(spoolPath, `${JSON.stringify(event)}\n`);
        console.error("Activity event was spooled for retry:", error);
      } catch (spoolError) {
        // SIEM failure must not roll back or fail the Quest action it observes.
        console.error("Activity event could not be persisted:", error, spoolError);
      }
    }
  }

  async function drainSpool() {
    const text = await readFile(spoolPath, "utf8").catch(() => "");
    if (!text.trim()) return;
    const remaining: string[] = [];
    for (const line of text.split("\n").filter(Boolean)) {
      try {
        await repository.append(JSON.parse(line));
      } catch {
        remaining.push(line);
      }
    }
    await writeFile(spoolPath, remaining.length ? `${remaining.join("\n")}\n` : "");
  }

  return {
    repository,
    drainSpool,
    async record(runId: string, input: RecordInput) {
      const event = createActivityEvent({
        runId,
        correlationId: input.correlationId ?? newCorrelationId(),
        causationId: input.causationId ?? null,
        aggregateType: input.aggregateType ?? null,
        aggregateId: input.aggregateId ?? null,
        source: input.source ?? "system",
        actorType: input.actorType ?? "system",
        actorProfileId: input.actorProfileId ?? null,
        actorName: input.actorName ?? null,
        questionId: input.questionId ?? null,
        answerId: input.answerId ?? null,
        httpMethod: input.httpMethod ?? null,
        apiPath: input.apiPath ?? null,
        httpStatus: input.httpStatus ?? null,
        severity: input.severity ?? "info",
        eventData: input.eventData ?? {},
        eventType: input.eventType,
        kind: input.kind,
        ...(input.id && { id: input.id }),
        ...(input.occurredAt && { occurredAt: input.occurredAt }),
      });
      await appendOrSpool(event);
      return event;
    },
  };
}
