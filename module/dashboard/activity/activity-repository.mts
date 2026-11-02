/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { connect, type Table } from "@lancedb/lancedb";
import type { ActivityEvent } from "./activity-event.mjs";

const TABLE_NAME = "activity_events";
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

const toRow = (event: ActivityEvent) => ({
  ...event,
  causationId: event.causationId ?? "",
  aggregateType: event.aggregateType ?? "",
  aggregateId: event.aggregateId ?? "",
  actorProfileId: event.actorProfileId ?? "",
  actorName: event.actorName ?? "",
  questionId: event.questionId ?? "",
  answerId: event.answerId ?? "",
  httpMethod: event.httpMethod ?? "",
  apiPath: event.apiPath ?? "",
  httpStatus: event.httpStatus ?? -1,
  eventData: JSON.stringify(event.eventData),
});

const fromRow = (row: Record<string, unknown>): ActivityEvent => ({
  ...(row as unknown as ActivityEvent),
  causationId: String(row.causationId || "") || null,
  aggregateType: String(row.aggregateType || "") || null,
  aggregateId: String(row.aggregateId || "") || null,
  actorProfileId: String(row.actorProfileId || "") || null,
  actorName: String(row.actorName || "") || null,
  questionId: String(row.questionId || "") || null,
  answerId: String(row.answerId || "") || null,
  httpMethod: String(row.httpMethod || "") || null,
  apiPath: String(row.apiPath || "") || null,
  httpStatus: Number(row.httpStatus) < 0 ? null : Number(row.httpStatus),
  eventData: JSON.parse(String(row.eventData || "{}")),
});

export function createActivityRepository(databasePath: string) {
  const databasePromise = connect(databasePath);
  let tablePromise: Promise<Table> | undefined;
  let writeQueue = Promise.resolve();

  async function table(seed: ActivityEvent) {
    if (!tablePromise) {
      tablePromise = (async () => {
        const database = await databasePromise;
        return (await database.tableNames()).includes(TABLE_NAME)
          ? database.openTable(TABLE_NAME)
          : database.createTable(TABLE_NAME, [toRow(seed)]);
      })();
    }
    return tablePromise;
  }

  async function existingTable() {
    if (tablePromise) return tablePromise;
    const database = await databasePromise;
    if (!(await database.tableNames()).includes(TABLE_NAME)) return undefined;
    tablePromise = database.openTable(TABLE_NAME);
    return tablePromise;
  }

  return {
    append(event: ActivityEvent) {
      const write = writeQueue.then(async () => {
        const activityTable = await table(event);
        const existing = await activityTable.query().where(`id = ${quote(event.id)}`).select(["id"]).limit(1).toArray();
        if (!existing.length) await activityTable.add([toRow(event)]);
      });
      writeQueue = write.catch(() => undefined);
      return write;
    },

    async listByRun(runId: string): Promise<ActivityEvent[]> {
      const activityTable = await existingTable();
      if (!activityTable) return [];
      const rows = await activityTable.query().where(`runId = ${quote(runId)}`).toArray();
      return rows.map((row) => fromRow(row as unknown as Record<string, unknown>)).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    },

    async listByQuestion(questionId: string): Promise<ActivityEvent[]> {
      const activityTable = await existingTable();
      if (!activityTable) return [];
      const rows = await activityTable.query().where(`questionId = ${quote(questionId)}`).toArray();
      return rows.map((row) => fromRow(row as unknown as Record<string, unknown>)).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    },

    async listRuns(): Promise<Array<{ name: string; mtime: number }>> {
      const activityTable = await existingTable();
      if (!activityTable) return [];
      const rows = await activityTable.query().select(["runId", "occurredAt"]).toArray();
      const latest = new Map<string, number>();
      for (const row of rows) latest.set(String(row.runId), Math.max(latest.get(String(row.runId)) ?? 0, Date.parse(String(row.occurredAt))));
      return [...latest].map(([name, mtime]) => ({ name, mtime })).sort((a, b) => b.mtime - a.mtime);
    },
  };
}
