/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { getRepository } from "../repository/getRepository.mjs";
import { toExternalProfileId } from "./profileId.mjs";

async function AddAnswer(request, context) {
  const repository = getRepository();
  const { questionId } = request.params;
  const profileId = request.userData.profileId;
  const { answer = null, option = null, duration, recipientProfileId, when = null } = request.clientParams;
  // Previous call passed `when` into the `recipientProfileId` position.
  // const questionnaire = await repository.addAnswerByQuestionId(questionId, profileId, duration, answer, option, when);
  const questionnaire = await repository.addAnswerByQuestionId(questionId, profileId, duration, answer, option, undefined, when);
  return { return: { id: questionnaire.id } };
}

async function GetAnswerById(request, context) {
  const repository = getRepository();
  const { id: questionId, answerId } = request.params;
  const answer = await repository.getAnswerById(questionId, answerId);
  return {
    return: {
      detail: answer && {
        ...answer,
        profileId: await toExternalProfileId(answer.profileId),
        recipientProfileId: answer.recipientProfileId ? await toExternalProfileId(answer.recipientProfileId) : null,
      },
    },
  };
}

async function GetAnswerListByQuestionId(request, context) {
  const repository = getRepository();
  const { questionId } = request.params;
  const profileId = request.userData?.profileId;
  const answers = await repository.getAnswerListByQuestionId(questionId);
  const processedAnswers = await Promise.all(
    answers.map(async (ans) => {
      return {
        ...ans,
        isEdited: ans.answerCount > 1 ? true : false,
        profileId: await toExternalProfileId(ans.profileId),
        pairwiseId: ans.pairwiseId,
        recipientProfileId: ans.recipientProfileId ? await toExternalProfileId(ans.recipientProfileId) : null,
        // TODO: lookup friend_name from friend table using profileId
        answerCount: undefined,
      };
    })
  );
  console.log("processedAnswers:", processedAnswers);
  return { return: { list: processedAnswers } };
}

export default {
  AddAnswer,
  GetAnswerById,
  GetAnswerListByQuestionId,
};
