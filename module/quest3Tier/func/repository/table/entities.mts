/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// Row shapes stored under the QuestionData table. Table Storage properties
// are limited to String/Int32/Int64/Double/Boolean/DateTime/Guid/Binary, so
// arrays (option) are stored as JSON strings and parsed back at the
// repository boundary.

export interface QuestionEntity {
  partitionKey: string;
  rowKey: string;
  id: string;
  profileId: string;
  title: string | null;
  questionText: string;
  option: string; // JSON-encoded string[] | null
  createdAt: string;
  etag?: string;
}

export interface AnswerEntity {
  partitionKey: string;
  rowKey: string;
  id: string;
  questionId: string;
  profileId: string;
  recipientProfileId: string;
  pairwiseId: string;
  answerText: string | null;
  optionId: string | null;
  duration: number;
  createdAt: string;
}

// Field names follow the Postgres "questionShare" table.
export interface QuestionShareEntity {
  partitionKey: string;
  rowKey: string;
  id: string;
  newQuestionId: string;
  senderProfileId: string;
  receiverProfileId: string;
  status: number;
  type: number;
  createdAt: string;
}

// Shapes returned to handlers, matching the existing API response contract.
export type AnswerRecord = Omit<AnswerEntity, "partitionKey" | "rowKey">;

export interface QuestionDetail {
  id: string;
  title: string | null;
  questionText: string;
  option: string[] | null;
  profileId: string;
}

// The full Postgres "question" row, which GetQuestionListByUser returned.
export interface QuestionListItem extends QuestionDetail {
  createdAt: string;
  sharedByProfileIds?: string[];
}

export interface AnswerListItem {
  id: string;
  profileId: string;
  recipientProfileId: string;
  pairwiseId: string;
  questionId: string;
  answerText: string | null;
  optionId: string | null;
  duration: number;
  createdAt: string;
  answerCount: number;
}
