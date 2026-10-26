/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// This is the repository layer for managing question-related models and their interactions with the database.

import { DataTypes } from "@sequelize/core";
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
import { Question } from "./interfaces.js";
import type { QuestRepository } from "../contracts.mjs";
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
  };

  Object.values(models).forEach((model) => {
    model.associate?.(models);
  });

  container.register("models", models);
  return { sequelize, models, repository };
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
// Previous signature omitted the `recipientProfileId` position used by the repository contract.
// async function addAnswerByQuestionId(questionId, profileId, duration, answer = null, option = null, when = null) {
async function addAnswerByQuestionId(questionId, profileId, duration, answer = null, option = null, _recipientProfileId = undefined, when = null) {
  try {
    const options = option === null ? null : Array.isArray(option) ? option : [option];
    return await models.QuestionAnswer.create({
      questionId: questionId,
      profileId: profileId, // Use the actual profileId when available
      answerText: answer,
      optionId: options?.[0] ?? null,
      optionAnswerList: options,
      when,
      duration: duration,
    });
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
async function getAnswerById(questionId, answerId) {
  try {
    return await models.QuestionAnswer.findOne({ where: { id: answerId, questionId: questionId } });
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
async function getAnswerListByQuestionId(questionId) {
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
    const answers = await models.QuestionAnswer.sequelize.query(
      `
          SELECT DISTINCT ON ("profileId")
            "id",
            "profileId",
            "createdAt",
            COUNT("id") OVER (PARTITION BY "profileId") AS "answerCount",
            "questionId",
            "answerText",
            "optionId",
            "optionAnswerList",
            "when",
            "duration"
          FROM "questionAnswer"
          WHERE "questionId" = :questionId
          ORDER BY "profileId", "createdAt" DESC;
        `,
      {
        replacements: { questionId },
        type: models.QuestionAnswer.sequelize.QueryTypes.SELECT,
      }
    );
    return answers.map((answer) => ({ ...answer, answerCount: Number(answer.answerCount) }));
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
async function getEventByCorrelationId(name, correlationId) {
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
    return await model.findAll({
      where: {
        correlationId,
      },
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
async function insertFollowUpCmd(senderId, cmdData, correlationId) {
  try {
    return await models.FollowUpCmd.create({
      senderProfileId: senderId,
      action: "create",
      data: cmdData,
      correlationId: correlationId,
    });
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
async function insertFollowUpFilter(senderId, cmdData) {
  try {
    if (cmdData.save) {
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
      return await models.FollowUpFilter.bulkCreate(filterDataAry);
    }
  } catch (err) {
    console.log(err);
  }
  return;
}

/**
 * Update the status of a follow-up command.
 * @param {string} id - Identifier of the follow-up command.
 * @returns {Promise<any>} The updated follow-up command.
 */
async function updateFollowUpCmdStatus(id) {
  try {
    return await models.FollowUpCmd.update({ status: 1 }, { where: { id: id }, individualHooks: true });
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
async function shareQuestion(newQuestionId, senderId, receiverIds) {
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
    return await models.QuestionShare.bulkCreate(addData);
  } catch (err) {
    console.log(err);
    throw new Error(`Failed to share question from senderId ${senderId} to receiversIds ${receiverIds.join(", ")}; ${err.message}`, { cause: err });
  }
}

async function insertQuestionShareCmd(senderId, cmdData, correlationId) {
  try {
    return await models.QuestionShareCmd.create({
      senderProfileId: senderId,
      action: "create",
      data: cmdData,
      correlationId: correlationId,
    });
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
async function updateQuestionShareCmdStatus(id) {
  try {
    return await models.QuestionShareCmd.update({ status: 1 }, { where: { id: id }, individualHooks: true });
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
async function create(profileId, title = null, question = null, optionList = null) {
  try {
    return await models.Question.create({
      profileId: profileId,
      title: title,
      questionText: question,
      optionList,
    });
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
async function updateById(questionId, title = null, questionText = null, optionList = null) {
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
async function getCombinationListByUser(profileId) {
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
      questions.map(async (question) => ({
        ...question.toJSON(),
        latestAnswer:
          (
            await models.QuestionAnswer.findOne({
              where: { questionId: question.id, profileId },
              order: [["createdAt", "DESC"]],
            })
          )?.toJSON() ?? null,
      }))
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
async function patchById(questionId, action, profileId) {
  try {
    const questionAction = await models.QuestionAction.create({ questionId, profileId, action });
    return { id: questionAction.id };
  } catch (err) {
    console.log(err);
    throw new Error(`Failed to patch question by ID: ${questionId}; ${err.message}`, { cause: err });
  }
}
async function findProfileByExternalId(externalId) {
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

async function createProfile(externalId) {
  try {
    const profile = await models.Profile.create({ external_id: externalId });
    return { id: profile.internal_id, externalId: profile.external_id };
  } catch (err) {
    console.log(err);
    throw new Error(`Function failed: ${err.message}`, { cause: err });
  }
}

async function ensureProfile(externalId, _details = {}) {
  const existing = await findProfileByExternalId(externalId);
  if (existing) return { profile: existing, created: false };
  return { profile: await createProfile(externalId), created: true };
}

async function updatePreferredName(externalId, preferredName) {
  const [updated] = await models.Profile.update({ preferred_name: preferredName }, { where: { external_id: externalId } });
  if (updated === 0) throw new Error("Profile not found");
  const profile = await findProfileByExternalId(externalId);
  if (!profile) throw new Error("Profile not found");
  return profile;
}

async function addFriend(_profileId: string, _friendId: string): Promise<never> {
  const error = new Error("Friend relationships require the Azure Table repository");
  error.status = 501;
  throw error;
}

async function listFriends(_profileId: string): Promise<never> {
  const error = new Error("Friend relationships require the Azure Table repository");
  error.status = 501;
  throw error;
}

async function getSharedQuestionListByProfileId(profileId) {
  try {
    return await models.Question.findAll({
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
  } catch (err) {
    console.log(err);
    throw new Error(`Failed to retrieve shared questions for profileId: ${profileId}; ${err.message}`, { cause: err });
  }
}

export async function getById(questionId) {
  try {
    const question = await models.Question.findByPk(questionId);
    if (!question) {
      return null;
    }
    const { id, title, questionText, optionList, profileId } = question.dataValues;
    return { id, title, questionText, optionList, profileId };
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
