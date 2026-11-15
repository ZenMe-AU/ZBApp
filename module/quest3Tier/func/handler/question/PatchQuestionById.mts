/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { z } from "zod";
import { commandResponses } from "../commonSchema.mjs";

export const params = z.object({ questionId: z.uuid() });

export const patchBody = z
  .array(
    z.object({
      op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
      path: z.string(),
      from: z.string().optional(),
      value: z.unknown().optional(),
    })
  )
  .meta({ id: "JsonPatch" });

export const body = z
  .union([
    patchBody,
    z.object({
      title: z.string().nullable().optional(),
      questionText: z.string(),
      optionList: z.array(z.string()).nullable().optional(),
    }),
  ])
  .meta({ id: "UpdateQuestionCommandBody" });

export const responses = commandResponses;
