/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { z } from "zod";
import { apiResponses } from "../commonSchema.mjs";
import { getRepository } from "../../repository/getRepository.mjs";

export const params = z.object({ id: z.uuid() });

export const body = z
  .object({
    answer: z.string().nullable().optional(),
    option: z.string().nullable().optional(),
    duration: z.int(),
  })
  .meta({ id: "AnswerBody" });

export const responses = apiResponses([200, 400, 401, 403, 500], z.object({ id: z.uuid() }));

type AddAnswerRequest = {
  params: { id: string };
  userData: { profileId: string };
  clientParams: {
    answer?: string | null;
    option?: string | null;
    duration: number;
  };
};

type AddAnswerResponse = {
  return: { id: string };
};

export async function AddAnswer(request, context) {
  const repository = getRepository();
  const { questionId } = request.params;
  const profileId = request.userData.profileId;
  const { answer = null, option = null, duration, recipientProfileId, when = null } = request.clientParams;
  const questionnaire = await repository.addAnswerByQuestionId(questionId, profileId, duration, answer, option, when);
  return { return: { id: questionnaire.id } };
}
