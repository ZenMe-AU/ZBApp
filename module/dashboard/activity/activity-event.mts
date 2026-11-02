/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { randomUUID } from "node:crypto";

export const ACTIVITY_KINDS = ["answer", "edit", "error", "finding", "followup", "memory", "note", "question", "read", "share", "start", "system"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type ActivityEvent = {
  id: string;
  runId: string;
  correlationId: string;
  causationId: string | null;
  aggregateType: string | null;
  aggregateId: string | null;
  eventType: string;
  kind: ActivityKind;
  source: "agent" | "quest-ui" | "q3-api" | "dashboard" | "llm" | "system";
  actorType: "agent" | "human" | "service" | "system";
  actorProfileId: string | null;
  actorName: string | null;
  questionId: string | null;
  answerId: string | null;
  httpMethod: string | null;
  apiPath: string | null;
  httpStatus: number | null;
  severity: "info" | "warning" | "error" | "security";
  eventData: Record<string, unknown>;
  occurredAt: string;
  ingestedAt: string;
};

export type ActivityEventInput = Omit<ActivityEvent, "id" | "occurredAt" | "ingestedAt"> & {
  id?: string;
  occurredAt?: string;
};

export const newCorrelationId = () => randomUUID().replaceAll("-", "");

export function createActivityEvent(input: ActivityEventInput): ActivityEvent {
  const now = new Date().toISOString();
  return {
    ...input,
    id: input.id ?? randomUUID(),
    occurredAt: input.occurredAt ?? now,
    ingestedAt: now,
  };
}
