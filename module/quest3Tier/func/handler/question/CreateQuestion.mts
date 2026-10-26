/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { z } from "zod";
import { apiResponses } from "../commonSchema.mjs";

export const body = z
  .object({
    title: z.string().nullable().optional(),
    questionText: z.string(),
    option: z.array(z.string()).nullable().optional(),
  })
  .meta({ id: "QuestionBody" });

export const responses = apiResponses([200, 400, 401, 403, 500], z.object({ id: z.uuid() }));
