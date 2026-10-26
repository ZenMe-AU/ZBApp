/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { z } from "zod";
import { apiResponses } from "../commonSchema.mjs";
import { getRepository } from "../../repository/getRepository.mjs";
import { toExternalProfileId } from "../profileId.mjs";

const answer = z
  .object({
    id: z.uuid(),
    questionId: z.uuid(),
    profileId: z.uuid().nullable(),
    answerText: z.string().nullable(),
    optionId: z.string().nullable(),
    optionAnswerList: z.array(z.string()).nullable().optional(),
    when: z.string().nullable(),
    duration: z.int(),
    createdAt: z.iso.datetime(),
    isEdited: z.boolean(),
  })
  .meta({ id: "AnswerListItem" });

export const params = z.object({ questionid: z.uuid() });

export const responses = apiResponses([200, 401, 403, 500], z.object({ list: z.array(answer) }));

export async function GetAnswerListByQuestionId(request, context) {
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
