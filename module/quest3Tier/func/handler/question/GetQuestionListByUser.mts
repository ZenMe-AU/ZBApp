/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { z } from "zod";
import { apiResponses } from "../commonSchema.mjs";

const question = z
  .object({
    id: z.uuid(),
    profileId: z.uuid(),
    title: z.string().nullable(),
    questionText: z.string(),
    option: z.array(z.string()).nullable(),
    createdAt: z.iso.datetime().optional(),
  })
  .meta({ id: "Question" });

export const responses = apiResponses([200, 401, 403, 500], z.object({ list: z.array(question) }));
