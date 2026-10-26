/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// Question repository backed by Azure Table Storage. Questions and shares are
// stored in QuestionData.

import { randomUUID } from "crypto";
import fastJsonPatch from "fast-json-patch";
import { odata, TableTransaction } from "@azure/data-tables";
import type { UpdateMode } from "@azure/data-tables";
import { getTableClient, isNotFoundError } from "./init.mjs";
import { assertProfileExists } from "./profileRepository.mjs";
import {
  QUESTION_DATA_TABLE,
  questionPartitionKey,
  questionRowKey,
  QUESTION_ROW_KEY_RANGE_START,
  QUESTION_ROW_KEY_RANGE_END,
  shareRowKey,
  SHARE_ROW_KEY_RANGE_START,
  SHARE_ROW_KEY_RANGE_END,
} from "./keys.mjs";
import type { QuestionEntity, QuestionDetail, QuestionListItem, QuestionShareEntity } from "./entities.mjs";

export interface CreateQuestionInput {
  profileId: string;
  title: string | null;
  questionText: string;
  option: string[] | null;
}

export interface UpdateQuestionInput {
  title: string | null;
  questionText: string | null;
  option: string[] | null;
}

function toQuestionDetail(entity: QuestionEntity): QuestionDetail {
  return {
    id: entity.id,
    title: entity.title ?? null,
    questionText: entity.questionText,
    option: entity.option ? JSON.parse(entity.option) : null,
    profileId: entity.profileId,
  };
}

export async function createQuestion(input: CreateQuestionInput): Promise<{ id: string }> {
  await assertProfileExists(input.profileId);
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const questionEntity: QuestionEntity = {
    partitionKey: questionPartitionKey(input.profileId),
    rowKey: questionRowKey(id),
    id,
    profileId: input.profileId,
    title: input.title,
    questionText: input.questionText,
    option: JSON.stringify(input.option ?? null),
    createdAt,
  };

  const client = await getTableClient(QUESTION_DATA_TABLE);
  await client.createEntity(questionEntity);

  return { id };
}

export async function getQuestionById(questionId: string): Promise<QuestionDetail | null> {
  const entity = await getQuestionEntity(questionId);
  return entity ? toQuestionDetail(entity) : null;
}
//TODO: Check if this is an appropriate way to implement record level access control.
export async function canAccessQuestion(questionId: string, profileId: string): Promise<boolean> {
  const question = await getQuestionEntity(questionId);
  if (!question) return false;
  if (question.profileId === profileId) return true;
  const client = await getTableClient(QUESTION_DATA_TABLE);
  const shares = client.listEntities<QuestionShareEntity>({
    queryOptions: {
      filter: odata`RowKey ge ${SHARE_ROW_KEY_RANGE_START} and RowKey lt ${SHARE_ROW_KEY_RANGE_END} and newQuestionId eq ${questionId} and receiverProfileId eq ${profileId}`,
    },
  });
  for await (const _share of shares) return true;
  return false;
}
async function getQuestionEntity(questionId: string): Promise<(QuestionEntity & { etag: string }) | null> {
  const client = await getTableClient(QUESTION_DATA_TABLE);
  const rows = client.listEntities<QuestionEntity>({
    queryOptions: { filter: odata`RowKey eq ${questionRowKey(questionId)}` },
  });
  for await (const row of rows) return row as QuestionEntity & { etag: string };
  return null;
}

function toQuestionListItem(entity: QuestionEntity): QuestionListItem {
  return { ...toQuestionDetail(entity), createdAt: entity.createdAt, sharedByProfileIds: [entity.profileId] };
}

export async function getQuestionAskers(questionId: string, answererProfileId: string): Promise<string[]> {
  const question = await getQuestionEntity(questionId);
  if (!question) return [];
  const askers = new Set([question.profileId]);
  const client = await getTableClient(QUESTION_DATA_TABLE);
  const shares = client.listEntities<QuestionShareEntity>({
    queryOptions: {
      filter: odata`RowKey ge ${SHARE_ROW_KEY_RANGE_START} and RowKey lt ${SHARE_ROW_KEY_RANGE_END} and newQuestionId eq ${questionId} and receiverProfileId eq ${answererProfileId}`,
    },
  });
  for await (const share of shares) askers.add(share.senderProfileId);
  return [...askers];
}

/**
 * Questions the profile owns plus questions shared with it, oldest first --
 * the Postgres "profileId = me OR QuestionShares.receiverProfileId = me" query.
 */
export async function getQuestionListByProfileId(profileId: string): Promise<QuestionListItem[]> {
  const client = await getTableClient(QUESTION_DATA_TABLE);
  // ponytail: both lookups scan the whole table; add a per-profile index table if QuestionData grows large.
  const owned = client.listEntities<QuestionEntity>({
    queryOptions: {
      filter: odata`PartitionKey eq ${questionPartitionKey(profileId)} and RowKey ge ${QUESTION_ROW_KEY_RANGE_START} and RowKey lt ${QUESTION_ROW_KEY_RANGE_END}`,
    },
  });
  const questions = new Map<string, QuestionListItem>();
  for await (const entity of owned) questions.set(entity.id, toQuestionListItem(entity));

  for (const question of await getSharedQuestionListByProfileId(profileId)) questions.set(question.id, question);

  return [...questions.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getSharedQuestionListByProfileId(profileId: string): Promise<QuestionListItem[]> {
  const client = await getTableClient(QUESTION_DATA_TABLE);
  // ponytail: this scans QuestionData; add a per-profile index table when measured volume requires it.
  const shares = client.listEntities<QuestionShareEntity>({
    queryOptions: { filter: odata`RowKey ge ${SHARE_ROW_KEY_RANGE_START} and RowKey lt ${SHARE_ROW_KEY_RANGE_END} and receiverProfileId eq ${profileId}` },
  });
  const sendersByQuestion = new Map<string, Set<string>>();
  for await (const share of shares) {
    const senders = sendersByQuestion.get(share.newQuestionId) ?? new Set<string>();
    senders.add(share.senderProfileId);
    sendersByQuestion.set(share.newQuestionId, senders);
  }
  const questions = await Promise.all([...sendersByQuestion.keys()].map(getQuestionEntity));
  return questions
    .filter((entity): entity is QuestionEntity & { etag: string } => entity !== null)
    .map((entity) => ({ ...toQuestionListItem(entity), sharedByProfileIds: [...(sendersByQuestion.get(entity.id) ?? new Set([entity.profileId]))] }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function shareQuestion(questionId: string, senderProfileId: string, receiverProfileIds: string[]): Promise<QuestionShareEntity[]> {
  // Postgres enforced these with foreign keys.
  await Promise.all([senderProfileId, ...receiverProfileIds].map(assertProfileExists));
  if (!(await getQuestionEntity(questionId))) {
    throw new Error(`Question not found for questionId: ${questionId}`);
  }

  const createdAt = new Date().toISOString();
  const shares = receiverProfileIds.map((receiverProfileId): QuestionShareEntity => {
    const id = randomUUID();
    return {
      partitionKey: questionPartitionKey(senderProfileId),
      rowKey: shareRowKey(questionId, id),
      id,
      newQuestionId: questionId,
      senderProfileId,
      receiverProfileId,
      status: 0,
      type: 0,
      createdAt,
    };
  });

  const client = await getTableClient(QUESTION_DATA_TABLE);
  // ponytail: a Table transaction holds at most 100 rows, so sharing with more receivers is not atomic.
  for (let i = 0; i < shares.length; i += 100) {
    const transaction = new TableTransaction();
    for (const share of shares.slice(i, i + 100)) transaction.createEntity(share);
    await client.submitTransaction(transaction.actions);
  }
  return shares;
}

function toUpdatedEntity(existing: QuestionEntity, next: UpdateQuestionInput): QuestionEntity {
  return {
    partitionKey: existing.partitionKey,
    rowKey: existing.rowKey,
    id: existing.id,
    profileId: existing.profileId,
    title: next.title,
    questionText: next.questionText ?? existing.questionText,
    option: JSON.stringify(next.option ?? null),
    createdAt: existing.createdAt,
  };
}

export async function updateQuestionById(questionId: string, input: UpdateQuestionInput, profileId: string): Promise<{ id: string }> {
  await assertProfileExists(profileId);
  const existing = await getQuestionEntity(questionId);
  if (!existing) {
    throw new Error(`Question not found for questionId: ${questionId}`);
  }

  const replaceMode: UpdateMode = "Replace";
  const client = await getTableClient(QUESTION_DATA_TABLE);
  await client.updateEntity(toUpdatedEntity(existing, input), replaceMode, { etag: existing.etag });

  return { id: questionId };
}

/**
 * Apply a JSON Patch (RFC 6902) to a question's title, questionText and
 * option. Returns the question id, the same as updateQuestionById.
 */
export async function patchQuestionById(questionId: string, profileId: string, patchOps: unknown): Promise<{ id: string }> {
  await assertProfileExists(profileId);
  const existing = await getQuestionEntity(questionId);
  if (!existing) {
    throw new Error(`Question not found for questionId: ${questionId}`);
  }

  const patched = fastJsonPatch.applyPatch(toQuestionDetail(existing), patchOps as never).newDocument;
  const next = { title: patched.title, questionText: patched.questionText, option: patched.option };

  const replaceMode: UpdateMode = "Replace";
  const client = await getTableClient(QUESTION_DATA_TABLE);
  await client.updateEntity(toUpdatedEntity(existing, next), replaceMode, { etag: existing.etag });

  return { id: questionId };
}
