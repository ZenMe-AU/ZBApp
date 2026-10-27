/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// This is the repository layer for managing question-related models and their interactions with the database.

import { DataTypes } from "@sequelize/core";
import { createHash } from "crypto";
import { initDbConnection, type DbConfig } from "./init.mjs";
import container from "../../di/diContainer.mjs";
import questionModel from "./models/Question.mjs";
import questionAnswerModel from "./models/QuestionAnswer.mjs";
import questionShareModel from "./models/QuestionShare.mjs";
import questionLogModel from "./models/QuestionLog.mjs";
import questionActionModel from "./models/QuestionAction.mjs";
import followUpCmdModel from "./models/FollowUpCmd.mjs";
import followUpFilterModel from "./models/FollowUpFilter.mjs";
import followUpEventModel from "./models/FollowUpEvent.mjs";
import questionShareCmdModel from "./models/QuestionShareCmd.mjs";
import questionShareEventModel from "./models/QuestionShareEvent.mjs";
import profileModel from "./models/Profile.mjs";
import profileFriendModel from "./models/ProfileFriend.mjs";
import { Question } from "./interfaces.js";
import type {
  CommandEventRecord,
  CommandRecord,
  AnswerRecord,
  EnsureProfileResult,
  FriendRecord,
  ProfileDetails,
  FollowUpFilterInput,
  FollowUpFilterRecord,
  QuestRepository,
  QuestionListRecord,
  QuestionPatchOperation,
  QuestionRecord,
  QuestionShareRecord,
  ProfileRecord,
  RepositoryJsonObject,
} from "../contracts.mjs";
import cmdName from "../../enum/cmdName.mjs";
import { v4 as uuidv4 } from "uuid";
import { Op } from "@sequelize/core";

let models: Record<string, any> | null = null;

// TODO: add code to capture the authenticated user to enforce row level rbac at query time.
export async function initRepository(config: DbConfig) {
  if (models) return { sequelize: models.Question.sequelize, models, repository };
  const sequelize = await initDbConnection(config);
  const Question = questionModel(sequelize, DataTypes);
  const QuestionAnswer = questionAnswerModel(sequelize, DataTypes);
  const QuestionShare = questionShareModel(sequelize, DataTypes);
  const QuestionLog = questionLogModel(sequelize, DataTypes);
  const QuestionAction = questionActionModel(sequelize, DataTypes);
  const FollowUpCmd = followUpCmdModel(sequelize, DataTypes);
  const FollowUpFilter = followUpFilterModel(sequelize, DataTypes);
  const FollowUpEvent = followUpEventModel(sequelize, DataTypes);
  const QuestionShareCmd = questionShareCmdModel(sequelize, DataTypes);
  const QuestionShareEvent = questionShareEventModel(sequelize, DataTypes);
  const Profile = profileModel(sequelize, DataTypes);
  const ProfileFriend = profileFriendModel(sequelize, DataTypes);

  models = {
    Question,
    QuestionAnswer,
    QuestionShare,
    QuestionLog,
    QuestionAction,
    FollowUpCmd,
    FollowUpFilter,
    FollowUpEvent,
    QuestionShareCmd,
    QuestionShareEvent,
    Profile,
    ProfileFriend,
  };

  Object.values(models).forEach((model) => {
    model.associate?.(models);
  });

  container.register("models", models);
  return { sequelize, models, repository };
}

function toQuestionRecord(question): QuestionRecord {
  const record = question.dataValues ?? question;
  return {
    id: record.id,
    title: record.title ?? null,
    questionText: record.questionText,
    optionList: record.optionList ?? record.option ?? null,
    profileId: record.profileId,
    createdAt: record.createdAt,
  };
}

function normalizeAnswer(answer, questionOwnerProfileId): AnswerRecord {
  const record = answer.dataValues ?? answer;
  const recipientProfileId = record.recipientProfileId ?? questionOwnerProfileId ?? record.profileId;
  return {
    id: record.id,
    questionId: record.questionId,
    profileId: record.profileId,
    recipientProfileId,
    pairwiseId: record.pairwiseId ?? createHash("sha256").update(`${recipientProfileId}:${record.profileId}`).digest("hex"),
    answerText: record.answerText ?? null,
    optionId: record.optionId ?? null,
    optionAnswerList: record.optionAnswerList ?? (record.optionId == null ? null : [record.optionId]),
    when: record.when ?? null,
    duration: record.duration,
    createdAt: record.createdAt,
    ...(record.answerCount === undefined ? {} : { answerCount: Number(record.answerCount) }),
  };
}

/**
 * Add an answer entry for a question.
 * @param {string} questionId - Identifier of the question.
 * @param {string} profileId - Profile that answered the question.
 * @param {number} duration - Time spent answering.
 * @param {string|null} [answer=null] - Answer text.
 * @param {string|null} [option=null] - Selected option identifier.
 * @returns {Promise<any>} Created answer model instance.
 */
async function addAnswerByQuestionId(
  questionId: string,
  profileId: string,
  duration: number,
  answer: string | null = null,
  option: string | string[] | null = null,
  when: string | null = null
): Promise<AnswerRecord> {
  try {
    const options = option === null ? null : Array.isArray(option) ? option : [option];
    const question = await models.Question.findByPk(questionId);
    if (!question) throw new Error(`Question not found for questionId: ${questionId}`);
    const recipientProfileId = question.profileId;
    const pairwiseId = createHash("sha256").update(`${recipientProfileId}:${profileId}`).digest("hex");
    const created = await models.QuestionAnswer.create({
      questionId: questionId,
      profileId: profileId, // Use the actual profileId when available
      recipientProfileId,
      pairwiseId,
      answerText: answer,
      optionId: options?.[0] ?? null,
      optionAnswerList: options,
      when,
      duration: duration,
    });
    return normalizeAnswer(created, recipientProfileId);
  } catch (err) {
    console.log(err);
    throw new Error(`Failed to add answer for questionId: ${questionId}; ${err.message}`, { cause: err });
  }
}

/**
 * Retrieve a specific answer by question and answer ids.
 * @param {string} questionId - Identifier of the question.
 * @param {string} answerId - Identifier of the answer.
 * @returns {Promise<any|null>} The matching answer or null when not found.
 */
async function getAnswerById(questionId: string, answerId: string): Promise<AnswerRecord | null> {
  try {
    const answer = await models.QuestionAnswer.findOne({ where: { id: answerId, questionId: questionId } });
    if (!answer) return null;
    const question = await models.Question.findByPk(questionId);
    return normalizeAnswer(answer, question?.profileId);
  } catch (err) {
    console.log(err);
    throw new Error(`Failed to retrieve answer for questionId ${questionId} and answerId ${answerId}: ${err.message}`, { cause: err });
  }
}

/**
 * Retrieve a list of answers for a specific question.
 * @param {string} questionId - Identifier of the question.
 * @returns {Promise<any[]>} List of matching answers.
 */
async function getAnswerListByQuestionId(questionId: string): Promise<AnswerRecord[]> {
  try {
    // return await QuestionAnswer.findAll({ where: { questionId: questionId }, order: [["createdAt", "DESC"]] });
    // return await QuestionAnswer.findAll({
    //   attributes: [
    //     "profileId",
    //     [Sequelize.fn("MAX", Sequelize.col("createdAt")), "latestCreatedAt"],
    //     [Sequelize.fn("COUNT", Sequelize.col("id")), "answerCount"],
    //     [Sequelize.literal(`FIRST_VALUE("answerText") OVER (PARTITION BY "profileId" ORDER BY "createdAt" DESC)`), "answerText"],
    //     [Sequelize.literal(`FIRST_VALUE("optionId") OVER (PARTITION BY "profileId" ORDER BY "createdAt" DESC)`), "optionId"],
    //    ],
    //   where: { questionId },
    //   group: ["profileId"],
    //   order: [[Sequelize.fn("MAX", Sequelize.col("createdAt")), "DESC"]],
    //   raw: true,
    // });
    const question = await models.Question.findByPk(questionId);
    const answers = await models.QuestionAnswer.sequelize.query(
      `
          SELECT DISTINCT ON ("profileId", COALESCE("recipientProfileId", :questionOwnerProfileId))
            "id",
            "profileId",
            "createdAt",
            COUNT("id") OVER (
              PARTITION BY "profileId", COALESCE("recipientProfileId", :questionOwnerProfileId)
            ) AS "answerCount",
            "questionId",
            "recipientProfileId",
            "pairwiseId",
            "answerText",
            "optionId",
            "optionAnswerList",
            "when",
            "duration"
          FROM "questionAnswer"
          WHERE "questionId" = :questionId
          ORDER BY "profileId", COALESCE("recipientProfileId", :questionOwnerProfileId), "createdAt" DESC;
        `,
      {
        replacements: { questionId, questionOwnerProfileId: question?.profileId ?? "" },
        type: models.QuestionAnswer.sequelize.QueryTypes.SELECT,
      }
    );
    return answers.map((answer) => ({
      ...normalizeAnswer(answer, question?.profileId),
      answerCount: Number(answer.answerCount),
    }));
  } catch (err) {
    console.log(err);
    throw new Error(`Failed to retrieve answers for questionId: ${questionId}; ${err.message}`, { cause: err });
  }
}

/**
 * Retrieve events by their correlation ID.
 * @param {string} name - Name of the event.
 * @param {string} correlationId - Correlation ID for the events.
 * @returns {Promise<any[]>} List of matching events.
 */
async function getEventByCorrelationId(name: "FollowUpCmd" | "QuestionShareCmd", correlationId: string): Promise<CommandEventRecord[]> {
  let model;
  switch (name) {
    case cmdName.FollowUpCmd:
      model = models.FollowUpEvent;
      break;
    case cmdName.QuestionShareCmd:
      model = models.QuestionShareEvent;
      break;
    default:
      throw new Error(`Unknown eventName: ${name}`);
  }
  try {
    const events = await model.findAll({
      where: {
        correlationId,
      },
    });
    return events.map((event) => {
      const record = event.dataValues;
      const common = {
        id: record.id,
        correlationId: record.correlationId,
        action: record.action,
        senderProfileId: record.senderProfileId,
        actionData: record.actionData,
        createdAt: record.createdAt,
      };
      return name === cmdName.FollowUpCmd
        ? { ...common, followUpId: record.followUpId }
        : { ...common, questionShareId: record.questionShareId };
    });
  } catch (err) {
    console.log(err);
    throw new Error(`Failed to get event by correlationId: ${correlationId}; ${err.message}`, { cause: err });
  }
}

/**
 * Insert a new follow-up command.
 * @param {string} senderId - Identifier of the sender.
 * @param {any} cmdData - Data for the follow-up command.
 * @param {string} correlationId - Identifier for correlating the command.
 * @returns {Promise<any>} The created follow-up command.
 */
async function insertFollowUpCmd(senderId: string, cmdData: RepositoryJsonObject, correlationId: string): Promise<CommandRecord> {
  try {
    const command = await models.FollowUpCmd.create({
      senderProfileId: senderId,
      action: "create",
      data: cmdData,
      correlationId: correlationId,
    });
    return { id: command.id };
  } catch (err) {
    console.log(err);
    throw new Error(`Failed to insert follow-up command; ${err.message}`, { cause: err });
  }
}

/**
 * Insert a new follow-up filter.
 * @param {string} senderId - Identifier of the authenticated sender.
 * @param {any} cmdData - Data for the follow-up filter.
 * @returns {Promise<any[]>} List of created follow-up filters.
 */
async function insertFollowUpFilter(senderId: string, cmdData: FollowUpFilterInput): Promise<FollowUpFilterRecord[]> {
  try {
    if (cmdData.save || cmdData.isSave) {
      const filterId = uuidv4();
      const filterDataAry = cmdData.question.map(function (filter, i) {
        return {
          id: filterId,
          order: i + 1,
          senderProfileId: senderId,
          refQuestionId: filter.questionId,
          refOption: filter.option,
          newQuestionId: cmdData.newQuestionId,
        };
      });
      const filters = await models.FollowUpFilter.bulkCreate(filterDataAry);
      return filters.map((filter) => ({
        id: filter.id,
        order: filter.order,
        senderProfileId: filter.senderProfileId,
        refQuestionId: filter.refQuestionId,
        refOption: filter.refOption,
        newQuestionId: filter.newQuestionId,
      }));
    }
  } catch (err) {
    console.log(err);
  }
  return [];
}

/**
 * Update the status of a follow-up command.
 * @param {string} id - Identifier of the follow-up command.
 * @returns {Promise<any>} The updated follow-up command.
 */
async function updateFollowUpCmdStatus(id: string): Promise<CommandRecord> {
  try {
    await models.FollowUpCmd.update({ status: 1 }, { where: { id: id }, individualHooks: true });
    return { id };
  } catch (err) {
    console.log(err);
    throw new Error(`Failed to update follow-up command status; ${err.message}`, { cause: err });
  }
}

/**
 * Share a question with multiple receivers.
 * @param {string} newQuestionId - Identifier of the new question.
 * @param {string} senderId - Identifier of the sender.
 * @param {string[]} receiverIds - List of receiver identifiers.
 * @returns {Promise<any[]>} List of created sharing records.
 */
async function shareQuestion(newQuestionId: string, senderId: string, receiverIds: string[]): Promise<QuestionShareRecord[]> {
  try {
    console.log("shareQuestion data:", newQuestionId, senderId, receiverIds);
    const addData = receiverIds.map(function (receiverId) {
      return {
        newQuestionId: newQuestionId,
        questionId: newQuestionId,
        senderProfileId: senderId,
        receiverProfileId: receiverId,
      };
    });
    const shares = await models.QuestionShare.bulkCreate(addData);
    return shares.map((share) => ({
      questionId: share.questionId,
      senderProfileId: share.senderProfileId,
      receiverProfileId: share.receiverProfileId,
    }));
  } catch (err) {
    console.log(err);
    throw new Error(`Failed to share question from senderId ${senderId} to receiversIds ${receiverIds.join(", ")}; ${err.message}`, { cause: err });
  }
}

async function insertQuestionShareCmd(
  senderId: string,
  cmdData: RepositoryJsonObject,
  correlationId: string
): Promise<CommandRecord> {
  try {
    const command = await models.QuestionShareCmd.create({
      senderProfileId: senderId,
      action: "create",
      data: cmdData,
      correlationId: correlationId,
    });
    return { id: command.id };
  } catch (err) {
    console.log(err);
    throw new Error(`Failed to insert question share command; ${err.message}`, { cause: err });
  }
}

/**
 * Update the status of a question share command.
 * @param {string} id - Identifier of the question share command.
 * @returns {Promise<any>} The updated question share command.
 */
async function updateQuestionShareCmdStatus(id: string): Promise<CommandRecord> {
  try {
    await models.QuestionShareCmd.update({ status: 1 }, { where: { id: id }, individualHooks: true });
    return { id };
  } catch (err) {
    console.log(err);
    throw new Error(`Failed to update question share command status; ${err.message}`, { cause: err });
  }
}

// TODO: This function depends on sequelize and should be made to return results based on the repository public interface.
/**
 * Create a new question record.
 * @param {string} profileId - Owner profile identifier.
 * @param {string|null} [title=null] - Question title.
 * @param {string|null} [question=null] - Question body text.
 * @param {string[]|null} [optionList=null] - Question option metadata.
 * @returns {Promise<any>} Created question model instance.
 */
async function create(
  profileId: string,
  title: string | null = null,
  question: string | null = null,
  optionList: string[] | null = null
): Promise<QuestionRecord> {
  try {
    const created = await models.Question.create({
      profileId: profileId,
      title: title,
      questionText: question ?? "",
      optionList,
    });
    return toQuestionRecord(created);
  } catch (err) {
    console.log(err);
    throw new Error(`Failed to create question for profileId: ${profileId}; ${err.message}`, { cause: err });
  }
}

// TODO: This function depends on sequelize and should bemade to return results based on the repository public interface.
/**
 * Update a question by its id.
 * @param {string} questionId - Identifier of the question to update.
 * @param {string|null} [title=null] - New question title.
 * @param {string|null} [questionText=null] - New question text.
 * @param {string[]|null} [optionList=null] - Updated question option metadata.
 * @returns {Promise<any>} Result of the update operation.
 */
async function updateById(
  questionId: string,
  title: string | null = null,
  questionText: string | null = null,
  optionList: string[] | null = null
): Promise<{ id: string }> {
  try {
    await models.Question.update(
      {
        title: title,
        questionText: questionText,
        optionList,
      },
      {
        where: {
          id: questionId,
        },
        individualHooks: true,
      }
    );
    return { id: questionId };
  } catch (err) {
    console.log(err);
    throw new Error(`Failed to update question for questionId: ${questionId}; ${err.message}`, { cause: err });
  }
}

// TODO: This function depends on sequelize and should be made to return results based on the repository public interface.
/**
 * Retrieve questions belonging to a user or shared with a user.
 * @param {string} profileId - Profile identifier.
 * @returns {Promise<Array<any>>} Combined list of owned or shared questions.
 */
async function getCombinationListByUser(profileId: string): Promise<QuestionListRecord[]> {
  try {
    const questions = await models.Question.findAll({
      where: {
        [Op.or]: [
          { profileId: profileId },
          {
            "$QuestionShares.receiverProfileId$": profileId,
          },
        ],
      },
      include: [
        {
          association: "QuestionShares",
          attributes: [],
          group: ["newQuestionId"],
        },
      ],
    });
    // shortcut: one answer lookup per question, batch only if question-list latency becomes measurable.
    return Promise.all(
      questions.map(async (question) => {
        const answer = await models.QuestionAnswer.findOne({
          where: { questionId: question.id, profileId },
          order: [["createdAt", "DESC"]],
        });
        return {
          ...toQuestionRecord(question),
          latestAnswer: answer ? normalizeAnswer(answer, question.profileId) : null,
        };
      })
    );
  } catch (err) {
    console.log(err);
    throw new Error(`Failed to retrieve questions for profileId: ${profileId}; ${err.message}`, { cause: err });
  }
}

// TODO: This function depends on sequelize and should be made to return results based on the repository public interface.
/**
 * Patch a question action by its ID.
 * @param {string} profileId - Identifier of the user.
 * @param {string} action - Action type to filter the questions.
 * @param {string} questionId - Identifier of the question to filter.
 * @returns {Promise<any[]>} List of shared questions.
 */
async function patchById(questionId: string, action: QuestionPatchOperation[], profileId: string): Promise<{ id: string }> {
  try {
    await models.QuestionAction.create({ questionId, profileId, action });
    return { id: questionId };
  } catch (err) {
    console.log(err);
    throw new Error(`Failed to patch question by ID: ${questionId}; ${err.message}`, { cause: err });
  }
}
async function findProfileByExternalId(externalId: string): Promise<ProfileRecord | null> {
  try {
    const profile = await models.Profile.findOne({
      where: { external_id: externalId },
      order: [
        ["createdAt", "ASC"],
        ["internal_id", "ASC"],
      ],
    });
    return profile ? { id: profile.internal_id, externalId: profile.external_id } : null;
  } catch (err) {
    console.log(err);
    throw new Error(`Function failed: ${err.message}`, { cause: err });
  }
}

async function createProfile(externalId: string): Promise<ProfileRecord> {
  try {
    const profile = await models.Profile.create({ external_id: externalId });
    return { id: profile.internal_id, externalId: profile.external_id };
  } catch (err) {
    console.log(err);
    throw new Error(`Function failed: ${err.message}`, { cause: err });
  }
}

async function ensureProfile(externalId: string, details: ProfileDetails = {}): Promise<EnsureProfileResult> {
  const existing = await findProfileByExternalId(externalId);
  if (existing) {
    const updates = {
      ...(details.name !== undefined ? { name: details.name } : {}),
      ...(details.preferredName !== undefined ? { preferred_name: details.preferredName } : {}),
    };
    if (Object.keys(updates).length > 0) await models.Profile.update(updates, { where: { internal_id: existing.id } });
    return { profile: existing, created: false };
  }
  const profile = await models.Profile.create({
    external_id: externalId,
    name: details.name ?? null,
    preferred_name: details.preferredName ?? "",
  });
  return { profile: { id: profile.internal_id, externalId: profile.external_id }, created: true };
}

async function updatePreferredName(externalId: string, preferredName: string): Promise<ProfileRecord> {
  const [updated] = await models.Profile.update({ preferred_name: preferredName }, { where: { external_id: externalId } });
  if (updated === 0) throw new Error("Profile not found");
  const profile = await findProfileByExternalId(externalId);
  if (!profile) throw new Error("Profile not found");
  return profile;
}

function friendDisplayName(profile): string {
  return profile.preferred_name || profile.name || "";
}

async function upsertFriend(profileId: string, friendProfileId: string, friendName: string): Promise<void> {
  await models.ProfileFriend.upsert({
    profileId,
    friendProfileId,
    friendName,
  });
}

async function addFriend(profileId: string, friendId: string): Promise<FriendRecord> {
  if (!friendId || profileId === friendId) {
    const error = new Error("A profile cannot add itself as a friend");
    error.status = 400;
    throw error;
  }
  const [profile, friend] = await Promise.all([models.Profile.findByPk(profileId), models.Profile.findByPk(friendId)]);
  if (!profile || !friend) {
    const error = new Error("Friend profile not found");
    error.status = 404;
    throw error;
  }

  const profileName = friendDisplayName(profile);
  const friendName = friendDisplayName(friend);
  await Promise.all([upsertFriend(profileId, friendId, friendName), upsertFriend(friendId, profileId, profileName)]);
  return { id: friend.internal_id, name: friendName, degree: 1, path: [profileId, friend.internal_id] };
}

function anonymousFriendName(profileId: string): string {
  return `Person ${createHash("sha256").update(profileId).digest("hex").slice(0, 4).toUpperCase()}`;
}

async function listFriends(profileId: string): Promise<FriendRecord[]> {
  const visited = new Set([profileId]);
  const result: FriendRecord[] = [];
  let frontier = [{ id: profileId, path: [profileId] }];

  for (let degree = 1; degree <= 4 && frontier.length > 0; degree += 1) {
    const next = [];
    for (const current of frontier) {
      const edges = await models.ProfileFriend.findAll({ where: { profileId: current.id } });
      for (const edge of edges) {
        if (visited.has(edge.friendProfileId)) continue;
        visited.add(edge.friendProfileId);
        const path = [...current.path, edge.friendProfileId];
        const friend = await models.Profile.findByPk(edge.friendProfileId);
        const name = friend ? friendDisplayName(friend) || edge.friendName || anonymousFriendName(edge.friendProfileId) : edge.friendName;
        next.push({ id: edge.friendProfileId, path });
        result.push({ id: edge.friendProfileId, name, degree, path });
      }
    }
    frontier = next;
  }
  return result;
}

async function getSharedQuestionListByProfileId(profileId: string): Promise<QuestionRecord[]> {
  try {
    const questions = await models.Question.findAll({
      where: {
        "$QuestionShares.receiverProfileId$": profileId,
      },
      include: [
        {
          association: "QuestionShares",
          attributes: [],
        },
      ],
    });
    return questions.map(toQuestionRecord);
  } catch (err) {
    console.log(err);
    throw new Error(`Failed to retrieve shared questions for profileId: ${profileId}; ${err.message}`, { cause: err });
  }
}

export async function getById(questionId: string): Promise<QuestionRecord | null> {
  try {
    const question = await models.Question.findByPk(questionId);
    if (!question) {
      return null;
    }
    return toQuestionRecord(question);
  } catch (err) {
    console.log(err);
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to retrieve question for questionId: ${questionId}; ${message}`, { cause: err });
  }
}

const repository = {
  getSharedQuestionListByProfileId,
  findProfileByExternalId,
  createProfile,
  ensureProfile,
  updatePreferredName,
  addFriend,
  listFriends,
  getById,
  patchById,
  getCombinationListByUser,
  updateById,
  create,
  addAnswerByQuestionId,
  getAnswerById,
  getAnswerListByQuestionId,
  getEventByCorrelationId,
  insertFollowUpCmd,
  insertFollowUpFilter,
  updateFollowUpCmdStatus,
  shareQuestion,
  insertQuestionShareCmd,
  updateQuestionShareCmdStatus,
} satisfies QuestRepository;

export default repository;
