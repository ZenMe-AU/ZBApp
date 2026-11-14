/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { z } from "zod";
import { commandResponses } from "../commonSchema.mjs";

export const body = z
  .object({
    title: z.string().nullable().optional(),
    questionText: z.string(),
    optionList: z.array(z.string()).nullable().optional(),
  })
  .meta({ id: "QuestionBody" });

export const responses = commandResponses;
