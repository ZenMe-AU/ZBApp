/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { getRepository } from "../repository/getRepository.mjs";

import { v4 as uuidv4 } from "uuid";
import cmdName from "../enum/cmdName.mjs";
import { toExternalProfileId, toInternalProfileId } from "./profileId.mjs";

async function GetEventByCorrelationId(request, context) {
  const repository = getRepository();
  const { correlationId } = request.params;
  const name = request.customParams?.name ?? request.params.name;
  const result = await repository.getEventByCorrelationId(name, correlationId);
  return { return: { qty: result.length } };
}

async function SendFollowUpCmd(request, context) {
  const repository = getRepository();
  const { correlationId, clientParams } = request;
  const profileId = request.userData.profileId;
  const questionIdList = clientParams.questionIdList ?? [clientParams.newQuestionId];
  const body = { ...clientParams, newQuestionId: questionIdList[0], questionIdList };
  const cmd = await repository.insertFollowUpCmd(profileId, body, correlationId);
  const filters = repository.insertFollowUpFilter(profileId, body);
  const receiverIds = getFollowUpReceiver(profileId, body);
  const sharedQuestions = Promise.all((await receiverIds).flatMap((receiverId) => questionIdList.map((questionId) => repository.shareQuestion(questionId, profileId, [receiverId]))));

  const settled = await Promise.allSettled([filters, sharedQuestions]);
  const errors = settled.filter((result) => result.status === "rejected").map((result) => result.reason);

  if (errors.length > 0) {
    throw new Error("Operations failed: " + errors.map((e) => e.message || e).join("; "));
  }

  await repository.updateFollowUpCmdStatus(cmd["id"]);
  return { return: true };
}

/**
 * Retrieve the list of receivers for a follow-up command.
 * @param {string} senderId - Identifier of the authenticated sender.
 * @param {any} cmdData - Data for the follow-up command.
 * @returns {Promise<string[]>} List of receiver identifiers.
 */
async function getFollowUpReceiver(senderId, cmdData) {
  try {
    const repository = getRepository();
    const filterReceiverIdAry = await Promise.all(
      cmdData.question.map(async function (filter) {
        const ansList = await repository.getAnswerListByQuestionId(filter.questionId);
        return ansList.reduce((acc, ans) => {
          if (ans.profileId !== senderId && (ans.optionAnswerList ?? []).some((option) => filter.option.includes(option))) {
            acc.push(ans.profileId);
          }
          return acc;
        }, []);
      })
    );
    console.log(filterReceiverIdAry);
    return filterReceiverIdAry.reduce((acc, arr) => {
      const set = new Set(arr);
      return acc.filter((item) => set.has(item));
    });
  } catch (err) {
    console.log(err);
    throw new Error(`Failed to retrieve follow-up receivers; ${err.message}`, { cause: err });
  }
}

async function ShareQuestionCmd(request, context) {
  const repository = getRepository();
  const { correlationId, clientParams: body } = request;
  const profileId = request.userData.profileId;
  const cmd = await repository.insertQuestionShareCmd(profileId, body, correlationId);
  const sharedQuestions = await repository.shareQuestion(body["newQuestionId"], profileId, await Promise.all(body["receiverIds"].map(toInternalProfileId)));

  await repository.updateQuestionShareCmdStatus(cmd["id"]);
  return { return: true };
}

async function ShareQuestionById(request, context) {
  const repository = getRepository();
  await repository.shareQuestion(request.params.id, request.userData.profileId, await Promise.all((request.clientParams.receiverIds ?? []).map(toInternalProfileId)));
  return { return: true };
}

async function GetSharedQuestionListByUser(request, context) {
  const repository = getRepository();
  const questions = await repository.getSharedQuestionListByProfileId(request.userData.profileId);
  return { return: { list: await Promise.all(questions.map(async (question) => ({ ...question, profileId: await toExternalProfileId(question.profileId) }))) } };
}

export default {
  ShareQuestionById,
  GetSharedQuestionListByUser,
  SendFollowUpCmd,
  ShareQuestionCmd,
  GetEventByCorrelationId,
};
