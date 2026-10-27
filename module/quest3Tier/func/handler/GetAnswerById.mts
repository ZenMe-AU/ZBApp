/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { z } from "zod";
import { apiResponses } from "./commonSchema.mjs";

const answer = z
  .object({
    id: z.uuid(),
    questionId: z.uuid(),
    profileId: z.uuid().nullable(),
    recipientProfileId: z.uuid().nullable(),
    pairwiseId: z.string(),
    answerText: z.string().nullable(),
    optionId: z.string().nullable(),
    optionAnswerList: z.array(z.string()).nullable().optional(),
    when: z.string().nullable(),
    duration: z.int(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "Answer" });

export const params = z.object({ answerId: z.uuid() });

export const responses = apiResponses([200, 401, 403, 500], z.object({ detail: answer.nullable() }));
