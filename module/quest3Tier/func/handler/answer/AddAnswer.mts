/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { z } from "zod";
import { commandResponses } from "../commonSchema.mjs";
import { getRepository } from "../../repository/getRepository.mjs";

export const params = z.object({ questionId: z.uuid() });

export const body = z
  .object({
    answer: z.string().nullable().optional(),
    option: z.union([z.string(), z.array(z.string().trim().min(1).max(255)).min(1)]).nullable().optional(),
    when: z.string().nullable().optional(),
    duration: z.int(),
  })
  .meta({ id: "AnswerBody" });

export const responses = commandResponses;

export async function AddAnswer(request, context) {
  const repository = getRepository();
  const { questionId } = request.params;
  const profileId = request.userData.profileId;
  const { answer = null, option = null, duration, when = null } = request.clientParams;
  const questionnaire = await repository.addAnswerByQuestionId(questionId, profileId, duration, answer, option, when);
  return { return: { id: questionnaire.id } };
}
