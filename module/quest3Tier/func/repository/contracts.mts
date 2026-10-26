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
  createdAt?: Date | string;
}

export interface AnswerRecord {
  id: string;
  questionId: string;
  profileId: string;
  recipientProfileId?: string;
  pairwiseId?: string;
  answerText: string | null;
  optionId: string | null;
  optionAnswerList?: string[] | null;
  when?: string | null;
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
  patchById(questionId: string, action: unknown, profileId: string): Promise<{ id: string }>;
  addAnswerByQuestionId(
    questionId: string,
    profileId: string,
    duration: number,
    answer?: string | null,
    option?: string | string[] | null,
    recipientProfileId?: string,
    when?: string | null
  ): Promise<AnswerRecord>;
  getAnswerById(questionId: string, answerId: string): Promise<AnswerRecord | null>;
  getAnswerListByQuestionId(questionId: string): Promise<AnswerRecord[]>;
  getEventByCorrelationId(name: string, correlationId: string): Promise<unknown[]>;
  insertFollowUpCmd(senderId: string, cmdData: Record<string, unknown>, correlationId: string): Promise<CommandRecord>;
  insertFollowUpFilter(senderId: string, cmdData: Record<string, unknown>): Promise<unknown>;
  updateFollowUpCmdStatus(id: string): Promise<unknown>;
  shareQuestion(questionId: string, senderId: string, receiverIds: string[]): Promise<unknown[]>;
  insertQuestionShareCmd(senderId: string, cmdData: Record<string, unknown>, correlationId: string): Promise<CommandRecord>;
  updateQuestionShareCmdStatus(id: string): Promise<unknown>;
  getSharedQuestionListByProfileId(profileId: string): Promise<QuestionRecord[]>;
}
