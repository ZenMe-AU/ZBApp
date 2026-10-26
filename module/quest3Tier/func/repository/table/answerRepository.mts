/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// Answer history is partitioned by the answering profile. Each submission has
// its own RowKey, so one user can answer the same question more than once.

import { createHash, randomUUID } from "crypto";
import { odata } from "@azure/data-tables";
import { getTableClient } from "./init.mjs";
import { assertProfileExists } from "./profileRepository.mjs";
import { getQuestionAskers, getQuestionById } from "./questionRepository.mjs";
import { QUESTION_DATA_TABLE, questionPartitionKey, answerRowKey, answerRowKeyRange } from "./keys.mjs";
import type { AnswerEntity, AnswerListItem, AnswerRecord } from "./entities.mjs";

export interface AddAnswerInput {
  questionId: string;
  profileId: string;
  recipientProfileId?: string;
  answerText: string | null;
  optionId: string | null;
  optionAnswerList?: string[] | null;
  when?: string | null;
  duration: number;
}

export async function addAnswer(input: AddAnswerInput): Promise<{ id: string }> {
  await assertProfileExists(input.profileId);
  // Answers live in their question's partition; without this check a bad id would create a partition with no question row.
  const question = await getQuestionById(input.questionId);
  if (!question) {
    throw new Error(`Question not found for questionId: ${input.questionId}`);
  }
  const recipientProfileId = input.recipientProfileId ?? question.profileId;
  if (!(await getQuestionAskers(input.questionId, input.profileId)).includes(recipientProfileId)) {
    throw new Error(`Question was not shared by recipientProfileId: ${recipientProfileId}`);
  }
  await assertProfileExists(recipientProfileId);
// TODO: Replace this with an auto generated pairwiseID on the friend object that is used here, instead of creating a new one.
  const pairwiseId = createHash("sha256").update(`${recipientProfileId}:${input.profileId}`).digest("hex");
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const entity: AnswerEntity = {
    partitionKey: questionPartitionKey(input.profileId),
    rowKey: answerRowKey(input.questionId, id),
    id,
    questionId: input.questionId,
    profileId: input.profileId,
    recipientProfileId,
    pairwiseId,
    answerText: input.answerText,
    optionId: input.optionId,
    optionAnswerList: input.optionAnswerList ? JSON.stringify(input.optionAnswerList) : input.optionId === null ? null : JSON.stringify([input.optionId]),
    when: input.when ?? null,
    duration: input.duration,
    createdAt,
  };

  const client = await getTableClient(QUESTION_DATA_TABLE);
  await client.createEntity(entity);

  return { id };
}

// Table Storage drops null properties, so nullable fields come back undefined; restore the Postgres nulls here.
function toAnswerRecord(e: AnswerEntity): AnswerRecord {
  const optionAnswerList = e.optionAnswerList ? JSON.parse(e.optionAnswerList) : e.optionId === null || e.optionId === undefined ? null : [e.optionId];
  return {
    id: e.id,
    questionId: e.questionId,
    profileId: e.profileId,
    recipientProfileId: e.recipientProfileId ?? "",
    pairwiseId: e.pairwiseId ?? createHash("sha256").update(`legacy:${e.questionId}:${e.profileId}`).digest("hex"),
    answerText: e.answerText ?? null,
    optionId: e.optionId ?? null,
    optionAnswerList,
    when: e.when ?? null,
    duration: e.duration,
    createdAt: e.createdAt,
  };
}

export async function getAnswerById(questionId: string, answerId: string): Promise<AnswerRecord | null> {
  const client = await getTableClient(QUESTION_DATA_TABLE);
  const results = client.listEntities<AnswerEntity>({
    queryOptions: { filter: odata`questionId eq ${questionId} and id eq ${answerId}` },
  });
  for await (const entity of results) {
    return toAnswerRecord(entity);
  }
  return null;
}
// TODO: The row level security is not implemented, it must be Intrinsic to the environment and enforced at all queries.
export async function getAnswerListByQuestionId(questionId: string): Promise<AnswerListItem[]> {
  const client = await getTableClient(QUESTION_DATA_TABLE);
  const [rowKeyStart, rowKeyEnd] = answerRowKeyRange(questionId);
  const results = client.listEntities<AnswerEntity>({
    queryOptions: {
      filter: odata`RowKey ge ${rowKeyStart} and RowKey lt ${rowKeyEnd}`,
    },
  });

  const latestByPair = new Map<string, AnswerListItem>();
  for await (const entity of results) {
    const record = toAnswerRecord(entity);
    const pairKey = `${record.profileId}:${record.recipientProfileId}`;
    const existing = latestByPair.get(pairKey);
    const answer = { ...toAnswerRecord(entity), answerCount: (existing?.answerCount ?? 0) + 1 };
    latestByPair.set(pairKey, !existing || answer.createdAt >= existing.createdAt ? answer : { ...existing, answerCount: answer.answerCount });
  }

  return [...latestByPair.values()];
}
