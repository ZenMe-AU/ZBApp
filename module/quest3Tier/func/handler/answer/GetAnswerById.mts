/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { z } from "zod";
import { apiResponses } from "../commonSchema.mjs";
import { getRepository } from "../../repository/getRepository.mjs";

const answer = z
  .object({
    id: z.uuid(),
    questionId: z.uuid(),
    profileId: z.uuid().nullable(),
    answerText: z.string().nullable(),
    optionId: z.string().nullable(),
    duration: z.int(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "Answer" });

export const params = z.object({ id: z.uuid(), answerId: z.uuid() });

export const responses = apiResponses([200, 401, 403, 500], z.object({ detail: answer.nullable() }));

export async function GetAnswerById(request, context) {
  const repository = getRepository();
  const { id: questionId, answerId } = request.params;
  const answer = await repository.getAnswerById(questionId, answerId);
  return { return: { detail: answer } };
}
