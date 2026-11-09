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
