/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { randomUUID } from "node:crypto";

export const ACTIVITY_KINDS = ["answer", "edit", "error", "finding", "followup", "memory", "note", "question", "read", "share", "start", "system"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const ACTIVITY_AGGREGATES = ["agent", "question", "run"] as const;
export type ActivityAggregate = (typeof ACTIVITY_AGGREGATES)[number];
export const ACTIVITY_SOURCES = ["agent", "dashboard", "llm", "q3-api", "quest-ui", "system"] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];
export const ACTIVITY_ACTOR_TYPES = ["agent", "human", "service", "system"] as const;
export type ActivityActorType = (typeof ACTIVITY_ACTOR_TYPES)[number];
export const ACTIVITY_SEVERITIES = ["info", "warning", "error", "security"] as const;
export type ActivitySeverity = (typeof ACTIVITY_SEVERITIES)[number];

export type ActivityEvent = {
  id: string;
  runId: string;
  correlationId: string;
  causationId: string | null;
  aggregateType: string | null;
  aggregateId: string | null;
  eventType: string;
  kind: ActivityKind;
  source: ActivitySource;
  actorType: ActivityActorType;
  actorProfileId: string | null;
  actorName: string | null;
  questionId: string | null;
  answerId: string | null;
  httpMethod: string | null;
  apiPath: string | null;
  httpStatus: number | null;
  severity: ActivitySeverity;
  eventData: Record<string, unknown>;
  occurredAt: string;
  ingestedAt: string;
};

export type ActivityEventInput = Omit<ActivityEvent, "id" | "occurredAt" | "ingestedAt"> & {
  id?: string;
  occurredAt?: string;
};

export const newCorrelationId = () => randomUUID().replaceAll("-", "");

export function activityAggregate(input: Pick<ActivityEvent, "runId" | "eventType" | "aggregateType" | "aggregateId" | "actorType" | "actorProfileId" | "actorName" | "questionId">): { aggregateType: ActivityAggregate; aggregateId: string } {
  if (input.questionId) return { aggregateType: "question", aggregateId: input.questionId };
  if (input.eventType.startsWith("run.")) return { aggregateType: "run", aggregateId: input.runId };
  if (ACTIVITY_AGGREGATES.includes(input.aggregateType as ActivityAggregate) && input.aggregateId) {
    return { aggregateType: input.aggregateType as ActivityAggregate, aggregateId: input.aggregateId };
  }
  if (input.actorType === "agent" && (input.actorProfileId || input.actorName)) {
    return { aggregateType: "agent", aggregateId: input.actorProfileId ?? input.actorName! };
  }
  return { aggregateType: "run", aggregateId: input.runId };
}

export function createActivityEvent(input: ActivityEventInput): ActivityEvent {
  const now = new Date().toISOString();
  const aggregate = activityAggregate(input);
  return {
    ...input,
    ...aggregate,
    id: input.id ?? randomUUID(),
    occurredAt: input.occurredAt ?? now,
    ingestedAt: now,
  };
}
