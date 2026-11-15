/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { z } from "zod";
import { apiResponses } from "../commonSchema.mjs";
import { getRepository } from "../../repository/getRepository.mjs";

const question = z
  .object({
    id: z.uuid(),
    profileId: z.uuid(),
    title: z.string().nullable(),
    questionText: z.string(),
    optionList: z.array(z.string()).nullable(),
    createdAt: z.iso.datetime().optional(),
  })
  .meta({ id: "Question" });

export const responses = apiResponses([200, 401, 403, 500], z.object({ list: z.array(question) }));

export async function GetSharedQuestionListByUser(request, context) {
  const repository = getRepository();
  return { return: { list: await repository.getSharedQuestionListByProfileId(request.userData.profileId) } };
}
