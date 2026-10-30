/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { randomUUID } from "crypto";
import { odata } from "@azure/data-tables";
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import sqlRepository from "../repository/sql/repository.mjs";
import { initSqlRepository, initTableRepository } from "./util/repositoriesInit.mjs";
import tableRepository from "../repository/table/repository.mjs";
import { getTableClient } from "../repository/table/init.mjs";
import { QUESTION_DATA_TABLE } from "../repository/table/keys.mjs";
import type { QuestionShareEntity } from "../repository/table/entities.mjs";
import type { QuestRepository } from "../repository/contracts.mjs";
import cmdName from "../enum/cmdName.mjs";

expectTypeOf<typeof sqlRepository>().toEqualTypeOf<QuestRepository>();
expectTypeOf<typeof tableRepository>().toEqualTypeOf<QuestRepository>();
expectTypeOf<typeof sqlRepository>().toEqualTypeOf<typeof tableRepository>();

interface RepositoryTestIds {
  profileIds: string[];
  externalIds: string[];
  questionIds: string[];
  followUpCmdIds: string[];
  questionShareCmdIds: string[];
}

describe("Test SQL repository", () => {
  let sequelize: Awaited<ReturnType<typeof initSqlRepository>>["sequelize"] | undefined;
  let models: Awaited<ReturnType<typeof initSqlRepository>>["models"];
  const ids = createRepositoryTestIds();
  beforeAll(async () => {
    ({ sequelize, models } = await initSqlRepository());
  });
  afterAll(async () => {
    try {
      if (models) await cleanupSqlRows(models, ids);
    } finally {
      if (sequelize) await sequelize.close();
    }
  });
  testRepositoryContract(sqlRepository, ids, async (questionId, senderId, receiverId) => {
    const share = await models.QuestionShare.findOne({ where: { newQuestionId: questionId, senderProfileId: senderId, receiverProfileId: receiverId } });
    expect(share?.get("questionId")).toBe(questionId);
    await share!.update({ questionId: null });
  });
});

describe("Test Azure Table repository", () => {
  const ids = createRepositoryTestIds();
  beforeAll(() => {
    initTableRepository();
  });
  afterAll(async () => {
    if (ids.profileIds.length > 0) await cleanupTableRows(ids.profileIds, ids.externalIds);
  });
  testRepositoryContract(tableRepository, ids, async (questionId, senderId, receiverId) => {
    const client = await getTableClient(QUESTION_DATA_TABLE);
    const rows = client.listEntities<QuestionShareEntity>({
      queryOptions: { filter: odata`PartitionKey eq ${senderId} and newQuestionId eq ${questionId} and receiverProfileId eq ${receiverId}` },
    });
    const share = (await rows.next()).value;
    expect(share?.questionId).toBe(questionId);
    const { partitionKey, rowKey, id, newQuestionId, senderProfileId, receiverProfileId, status, type, createdAt } = share!;
    await client.updateEntity({ partitionKey, rowKey, id, newQuestionId, senderProfileId, receiverProfileId, status, type, createdAt }, "Replace");
  });

  it("patches optionList array entries", async () => {
    const externalId = `option-list-${randomUUID()}`;
    ids.externalIds.push(externalId);
    const profile = await tableRepository.createProfile(externalId);
    ids.profileIds.push(profile.id);
    const question = await tableRepository.create(profile.id, "Options", "Choose one", ["A", "B", "C"]);
    ids.questionIds.push(question.id);

    await tableRepository.patchById(question.id, [{ op: "replace", path: "/optionList/2", value: "Updated C" }], profile.id);

    await expect(tableRepository.getById(question.id)).resolves.toMatchObject({ optionList: ["A", "B", "Updated C"] });
  });

  it("stores the signed-in name on the canonical profile", async () => {
    const externalId = `named-profile-${randomUUID()}`;
    const profiles = await getTableClient("Profiles");
    const internalIndex = await getTableClient("ProfileByInternalId");
    const result = await tableRepository.ensureProfile(externalId, { name: "Josh Kim" });
    try {
      await expect(profiles.getEntity(externalId, "profile")).resolves.toMatchObject({ name: "Josh Kim", preferred_name: "" });
      await tableRepository.ensureProfile(externalId, { name: "Joshua Kim" });
      await expect(profiles.getEntity(externalId, "profile")).resolves.toMatchObject({ name: "Joshua Kim" });
    } finally {
      await profiles.deleteEntity(externalId, "profile");
      await internalIndex.deleteEntity(result.profile.id, "profile");
    }
  });

  it("stores a preferred name without replacing the signed-in name", async () => {
    const externalId = `preferred-name-${randomUUID()}`;
    const profiles = await getTableClient("Profiles");
    const internalIndex = await getTableClient("ProfileByInternalId");
    const result = await tableRepository.ensureProfile(externalId, { name: "Joshua Kim" });
    try {
      await tableRepository.updatePreferredName(externalId, "Josh");
      await expect(profiles.getEntity(externalId, "profile")).resolves.toMatchObject({ name: "Joshua Kim", preferred_name: "Josh" });
    } finally {
      await profiles.deleteEntity(externalId, "profile");
      await internalIndex.deleteEntity(result.profile.id, "profile");
    }
  });

  it("creates both directions of a friend relationship", async () => {
    const profiles = await getTableClient("Profiles");
    const internalIndex = await getTableClient("ProfileByInternalId");
    const josh = await tableRepository.ensureProfile(`friend-josh-${randomUUID()}`, { name: "Josh Kim" });
    const bella = await tableRepository.ensureProfile(`friend-bella-${randomUUID()}`, { name: "Bella Jones" });
    try {
      await expect(tableRepository.addFriend(josh.profile.id, bella.profile.id)).resolves.toEqual({
        id: bella.profile.id,
        name: "Bella Jones",
        degree: 1,
        path: [josh.profile.id, bella.profile.id],
      });
      await tableRepository.updatePreferredName(bella.profile.externalId, "B");
      await expect(tableRepository.listFriends(josh.profile.id)).resolves.toEqual([
        { id: bella.profile.id, name: "B", degree: 1, path: [josh.profile.id, bella.profile.id] },
      ]);
      await expect(profiles.getEntity(josh.profile.id, `friend:${bella.profile.id}`)).resolves.toMatchObject({
        friend_internal_id: bella.profile.id,
        friend_name: "Bella Jones",
      });
      await expect(profiles.getEntity(bella.profile.id, `friend:${josh.profile.id}`)).resolves.toMatchObject({
        friend_internal_id: josh.profile.id,
        friend_name: "Josh Kim",
      });
      await expect(tableRepository.addFriend(josh.profile.id, josh.profile.id)).rejects.toMatchObject({ status: 400 });
    } finally {
      await profiles.deleteEntity(josh.profile.id, `friend:${bella.profile.id}`);
      await profiles.deleteEntity(bella.profile.id, `friend:${josh.profile.id}`);
      await profiles.deleteEntity(josh.profile.externalId, "profile");
      await profiles.deleteEntity(bella.profile.externalId, "profile");
      await internalIndex.deleteEntity(josh.profile.id, "profile");
      await internalIndex.deleteEntity(bella.profile.id, "profile");
    }
  });

  it("finds unique friends through four relationship levels", async () => {
    const profiles = await getTableClient("Profiles");
    const internalIndex = await getTableClient("ProfileByInternalId");
    const people = await Promise.all(
      ["Josh", "Bella", "Eric", "Ian", "Mike"].map((name) => tableRepository.ensureProfile(`network-${name}-${randomUUID()}`, { name }))
    );
    try {
      for (let index = 0; index < people.length - 1; index += 1) {
        await tableRepository.addFriend(people[index].profile.id, people[index + 1].profile.id);
      }
      await expect(tableRepository.listFriends(people[0].profile.id)).resolves.toEqual(
        people.slice(1).map((person, index) => ({
          id: person.profile.id,
          name: ["Bella", "Eric", "Ian", "Mike"][index],
          degree: index + 1,
          path: people.slice(0, index + 2).map((item) => item.profile.id),
        }))
      );
    } finally {
      for (const owner of people) {
        for (const friend of people) {
          if (owner !== friend) await profiles.deleteEntity(owner.profile.id, `friend:${friend.profile.id}`).catch(() => undefined);
        }
        await profiles.deleteEntity(owner.profile.externalId, "profile");
        await internalIndex.deleteEntity(owner.profile.id, "profile");
      }
    }
  });

  it("uses external id for the profile partition and preserves legacy internal ids", async () => {
    const externalId = `legacy-profile-${randomUUID()}`;
    const internalId = randomUUID();
    const profiles = await getTableClient("Profiles");
    const legacyIndex = await getTableClient("ProfileByExternalId");
    const internalIndex = await getTableClient("ProfileByInternalId");
    const createdAt = new Date().toISOString();

    await profiles.createEntity({ partitionKey: internalId, rowKey: "profile", internal_id: internalId, external_id: externalId, createdAt });
    await legacyIndex.createEntity({ partitionKey: externalId, rowKey: "profile", internal_id: internalId, external_id: externalId, createdAt });
    try {
      await expect(tableRepository.findProfileByExternalId(externalId)).resolves.toEqual({ id: internalId, externalId });
      await expect(profiles.getEntity(externalId, "profile")).resolves.toMatchObject({ internal_id: internalId, external_id: externalId });
      await expect(internalIndex.getEntity(internalId, "profile")).resolves.toMatchObject({ external_id: externalId });
    } finally {
      await profiles.deleteEntity(externalId, "profile");
      await profiles.deleteEntity(internalId, "profile");
      await internalIndex.deleteEntity(internalId, "profile");
      await legacyIndex.deleteEntity(externalId, "profile");
    }
  });
});

function testRepositoryContract(
  repository: QuestRepository,
  ids: RepositoryTestIds,
  verifyShare: (questionId: string, senderId: string, receiverId: string) => Promise<void>
) {
  it("testRepositoryContract: question, answer, share, and follow-up", async () => {
    async function createTestProfile(label: string) {
      const externalId = `questdb-${label}-${randomUUID()}`;
      ids.externalIds.push(externalId);
      const profile = await repository.createProfile(externalId);
      ids.profileIds.push(profile.id);
      await expect(repository.findProfileByExternalId(externalId)).resolves.toEqual(profile);
      return profile;
    }

    const owner = await createTestProfile("owner");
    const responder = await createTestProfile("responder");
    const receiver = await createTestProfile("receiver");

    await expect(repository.addFriend(owner.id, responder.id)).resolves.toEqual({
      id: responder.id,
      name: "",
      degree: 1,
      path: [owner.id, responder.id],
    });
    const friends = await repository.listFriends(owner.id);
    expect(friends).toHaveLength(1);
    expect(friends[0]).toMatchObject({ id: responder.id, degree: 1, path: [owner.id, responder.id] });
    expect(friends[0].name).toMatch(/^Person [A-F0-9]{4}$/);

    const question = await repository.create(owner.id, "Quest DB", "Which option?", ["yes", "no"]);
    ids.questionIds.push(question.id);
    await expect(repository.getById(question.id)).resolves.toMatchObject({
      id: question.id,
      profileId: owner.id,
      title: "Quest DB",
      questionText: "Which option?",
      optionList: ["yes", "no"],
    });
    await expect(repository.getCombinationListByUser(owner.id)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: question.id, latestAnswer: null })])
    );
    await expect(repository.shareQuestion(question.id, owner.id, [responder.id])).resolves.toHaveLength(1);
    await verifyShare(question.id, owner.id, responder.id);
    await expect(repository.getSharedQuestionListByProfileId(responder.id)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: question.id, profileId: owner.id })])
    );

    await expect(repository.updateById(question.id, "Updated Quest DB", "Which option?", ["yes", "no", "maybe"])).resolves.toEqual({ id: question.id });
    await expect(repository.patchById(question.id, [{ op: "replace", path: "/title", value: "Patched Quest DB" }], owner.id)).resolves.toMatchObject({
      id: question.id,
    });
    await expect(repository.patchById(question.id, [{ op: "replace", path: "/optionList/2", value: "later" }], owner.id)).resolves.toMatchObject({
      id: question.id,
    });
    await expect(repository.getById(question.id)).resolves.toMatchObject({ title: "Patched Quest DB", optionList: ["yes", "no", "later"] });

    const answer = await repository.addAnswerByQuestionId(question.id, responder.id, 15, "yes", "yes", "during-work");
    await expect(repository.getAnswerById(question.id, answer.id)).resolves.toMatchObject({
      id: answer.id,
      questionId: question.id,
      profileId: responder.id,
      recipientProfileId: owner.id,
      pairwiseId: expect.stringMatching(/^[0-9a-f]{64}$/),
      answerText: "yes",
      optionId: "yes",
      optionAnswerList: ["yes"],
      when: "during-work",
      duration: 15,
    });
    await expect(repository.getAnswerListByQuestionId(question.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          profileId: responder.id,
          recipientProfileId: owner.id,
          pairwiseId: expect.stringMatching(/^[0-9a-f]{64}$/),
          answerCount: 1,
          optionId: "yes",
          optionAnswerList: ["yes"],
          when: "during-work",
        }),
      ])
    );

    await repository.addAnswerByQuestionId(question.id, responder.id, 12, "no", "no");
    await expect(repository.getCombinationListByUser(responder.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: question.id,
          latestAnswer: expect.objectContaining({
            profileId: responder.id,
            recipientProfileId: owner.id,
            pairwiseId: expect.stringMatching(/^[0-9a-f]{64}$/),
            optionId: "no",
          }),
        }),
      ])
    );

    const multiAnswer = await repository.addAnswerByQuestionId(question.id, responder.id, 10, null, ["yes", "custom option"]);
    await expect(repository.getAnswerById(question.id, multiAnswer.id)).resolves.toMatchObject({
      optionId: "yes",
      optionAnswerList: ["yes", "custom option"],
    });
    await expect(repository.getAnswerListByQuestionId(question.id)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ profileId: responder.id, optionAnswerList: ["yes", "custom option"] })])
    );
    await expect(repository.getCombinationListByUser(responder.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: question.id, latestAnswer: expect.objectContaining({ optionAnswerList: ["yes", "custom option"] }) }),
      ])
    );

    await expect(repository.shareQuestion(question.id, owner.id, [receiver.id])).resolves.toHaveLength(1);
    await expect(repository.getSharedQuestionListByProfileId(receiver.id)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: question.id, profileId: owner.id })])
    );

    const correlationId = randomUUID();
    const followUpData = {
      save: true,
      newQuestionId: question.id,
      question: [{ questionId: question.id, option: ["yes"] }],
    };
    const followUp = await repository.insertFollowUpCmd(owner.id, followUpData, correlationId);
    ids.followUpCmdIds.push(followUp.id);
    await expect(repository.insertFollowUpFilter(owner.id, followUpData)).resolves.toHaveLength(1);
    await repository.updateFollowUpCmdStatus(followUp.id);
    await expect(repository.getEventByCorrelationId(cmdName.FollowUpCmd, correlationId)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ followUpId: followUp.id, senderProfileId: owner.id })])
    );

    const shareCorrelationId = randomUUID();
    const shareCommand = await repository.insertQuestionShareCmd(owner.id, { newQuestionId: question.id, receiverIds: [receiver.id] }, shareCorrelationId);
    ids.questionShareCmdIds.push(shareCommand.id);
    await repository.updateQuestionShareCmdStatus(shareCommand.id);
    await expect(repository.getEventByCorrelationId(cmdName.QuestionShareCmd, shareCorrelationId)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ questionShareId: shareCommand.id, senderProfileId: owner.id })])
    );
  }, 30000);
}

function createRepositoryTestIds(): RepositoryTestIds {
  return { profileIds: [], externalIds: [], questionIds: [], followUpCmdIds: [], questionShareCmdIds: [] };
}

async function cleanupTableRows(profileIds: string[], externalIds: string[]) {
  const questionData = await getTableClient(QUESTION_DATA_TABLE);
  for (const profileId of profileIds) {
    const rows = questionData.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${profileId}` } });
    for await (const row of rows) await questionData.deleteEntity(row.partitionKey, row.rowKey);
  }

  const profiles = await getTableClient("Profiles");
  for (const profileId of profileIds) {
    const friends = profiles.listEntities({
      queryOptions: { filter: odata`PartitionKey eq ${profileId} and RowKey ge ${"friend:"} and RowKey lt ${"friend;"}` },
    });
    for await (const friend of friends) await profiles.deleteEntity(friend.partitionKey, friend.rowKey);
  }
  for (const externalId of externalIds) await profiles.deleteEntity(externalId, "profile");

  const profileIndexes = await getTableClient("ProfileByInternalId");
  for (const profileId of profileIds) await profileIndexes.deleteEntity(profileId, "profile");
}

async function cleanupSqlRows(models: Awaited<ReturnType<typeof initSqlRepository>>["models"], ids: RepositoryTestIds) {
  if (ids.questionIds.length > 0) {
    await models.QuestionAnswer.destroy({ where: { questionId: ids.questionIds } });
    await models.QuestionShare.destroy({ where: { newQuestionId: ids.questionIds } });
    await models.FollowUpFilter.destroy({ where: { newQuestionId: ids.questionIds } });
    await models.QuestionAction.destroy({ where: { questionId: ids.questionIds } });
    await models.QuestionLog.destroy({ where: { questionId: ids.questionIds } });
    await models.Question.destroy({ where: { id: ids.questionIds } });
  }
  if (ids.followUpCmdIds.length > 0) {
    await models.FollowUpEvent.destroy({ where: { followUpId: ids.followUpCmdIds } });
    await models.FollowUpCmd.destroy({ where: { id: ids.followUpCmdIds } });
  }
  if (ids.questionShareCmdIds.length > 0) {
    await models.QuestionShareEvent.destroy({ where: { questionShareId: ids.questionShareCmdIds } });
    await models.QuestionShareCmd.destroy({ where: { id: ids.questionShareCmdIds } });
  }
  if (ids.profileIds.length > 0) await models.Profile.destroy({ where: { internal_id: ids.profileIds } });
}
