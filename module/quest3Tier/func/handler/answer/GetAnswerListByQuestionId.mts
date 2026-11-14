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
    optionAnswerList: z.array(z.string()).nullable(),
    when: z.string().nullable(),
    duration: z.int(),
    createdAt: z.iso.datetime(),
    isEdited: z.boolean(),
  })
  .meta({ id: "AnswerListItem" });

export const params = z.object({ questionId: z.uuid() });

export const responses = apiResponses([200, 401, 403, 500], z.object({ list: z.array(answer) }));

export async function GetAnswerListByQuestionId(request, context) {
  const repository = getRepository();
  const { questionId } = request.params;
  const answers = await repository.getAnswerListByQuestionId(questionId);
  const processedAnswers = await Promise.all(
    answers.map(async (ans) => ({
      ...ans,
      isEdited: ans.answerCount > 1 ? true : false,
      // TODO: Replace external profile ID with pairwise ID.
      profileId: await toExternalProfileId(ans.profileId),
      // TODO: lookup friend_name from friend table using profileId
      answerCount: undefined,
    }))
  );
  return { return: { list: processedAnswers } };
}
