/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

export interface ProfileRecord {
  id: string;
  externalId: string;
}

export interface ProfileDetails {
  name?: string;
  preferredName?: string;
}

export interface EnsureProfileResult {
  profile: ProfileRecord;
  created: boolean;
}

export interface FriendRecord {
  id: string;
  name: string;
  degree: number;
  path: string[];
}

export interface QuestionRecord {
  id: string;
  title: string | null;
  questionText: string;
  optionList: string[] | null;
  profileId: string;
  createdAt: Date | string;
}

export interface AnswerRecord {
  id: string;
  questionId: string;
  profileId: string;
  recipientProfileId: string;
  pairwiseId: string;
  answerText: string | null;
  optionId: string | null;
  optionAnswerList: string[] | null;
  when: string | null;
  duration: number;
  createdAt: Date | string;
  answerCount?: number;
}

export interface QuestionListRecord extends QuestionRecord {
  latestAnswer: AnswerRecord | null;
}

export interface CommandRecord {
  id: string;
}

export type RepositoryJsonValue = string | number | boolean | null | RepositoryJsonObject | RepositoryJsonValue[];

export interface RepositoryJsonObject {
  [key: string]: RepositoryJsonValue;
}

export type QuestionPatchOperation =
  | { op: "add" | "replace" | "test"; path: string; value: RepositoryJsonValue }
  | { op: "remove"; path: string }
  | { op: "move" | "copy"; path: string; from: string };

export type CommandEventRecord =
  | {
      id: string;
      followUpId: string;
      questionShareId?: never;
      correlationId: string;
      action: string;
      senderProfileId: string;
      actionData: RepositoryJsonValue;
      createdAt: Date | string;
    }
  | {
      id: string;
      followUpId?: never;
      questionShareId: string;
      correlationId: string;
      action: string;
      senderProfileId: string;
      actionData: RepositoryJsonValue;
      createdAt: Date | string;
    };

export interface FollowUpFilterRecord {
  id: string;
  order: number;
  senderProfileId: string;
  refQuestionId: string;
  refOption: string[];
  newQuestionId: string;
}

export interface QuestionShareRecord {
  questionId: string;
  senderProfileId: string;
  receiverProfileId: string;
}

export interface FollowUpFilterInput extends RepositoryJsonObject {
  save?: boolean;
  isSave?: boolean;
  newQuestionId?: string;
  questionIdList?: string[];
  question?: { questionId: string; option: string[] }[];
}

export interface QuestRepository {
  findProfileByExternalId(externalId: string): Promise<ProfileRecord | null>;
  createProfile(externalId: string): Promise<ProfileRecord>;
  ensureProfile(externalId: string, details?: ProfileDetails): Promise<EnsureProfileResult>;
  updatePreferredName(externalId: string, preferredName: string): Promise<ProfileRecord>;
  addFriend(profileId: string, friendId: string): Promise<FriendRecord>;
  listFriends(profileId: string): Promise<FriendRecord[]>;
  getById(questionId: string): Promise<QuestionRecord | null>;
  create(profileId: string, title?: string | null, question?: string | null, optionList?: string[] | null): Promise<QuestionRecord>;
  updateById(questionId: string, title?: string | null, questionText?: string | null, optionList?: string[] | null): Promise<{ id: string }>;
  getCombinationListByUser(profileId: string): Promise<QuestionListRecord[]>;
  patchById(questionId: string, action: QuestionPatchOperation[], profileId: string): Promise<{ id: string }>;
  addAnswerByQuestionId(
    questionId: string,
    profileId: string,
    duration: number,
    answer?: string | null,
    option?: string | string[] | null,
    when?: string | null
  ): Promise<AnswerRecord>;
  getAnswerById(questionId: string, answerId: string): Promise<AnswerRecord | null>;
  getAnswerListByQuestionId(questionId: string): Promise<AnswerRecord[]>;
  getEventByCorrelationId(name: "FollowUpCmd" | "QuestionShareCmd", correlationId: string): Promise<CommandEventRecord[]>;
  insertFollowUpCmd(senderId: string, cmdData: RepositoryJsonObject, correlationId: string): Promise<CommandRecord>;
  insertFollowUpFilter(senderId: string, cmdData: FollowUpFilterInput): Promise<FollowUpFilterRecord[]>;
  updateFollowUpCmdStatus(id: string): Promise<CommandRecord>;
  shareQuestion(questionId: string, senderId: string, receiverIds: string[]): Promise<QuestionShareRecord[]>;
  insertQuestionShareCmd(senderId: string, cmdData: RepositoryJsonObject, correlationId: string): Promise<CommandRecord>;
  updateQuestionShareCmdStatus(id: string): Promise<CommandRecord>;
  getSharedQuestionListByProfileId(profileId: string): Promise<QuestionRecord[]>;
}
