/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { z } from "zod";
import { apiResponses } from "../commonSchema.mjs";

export const params = z.object({ id: z.uuid() });

export const body = z
  .array(
    z.object({
      op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
      path: z.string(),
      from: z.string().optional(),
      value: z.unknown().optional(),
    })
  )
  .meta({ id: "JsonPatch" });

export const responses = apiResponses([200, 400, 401, 403, 500], z.object({ id: z.uuid() }));
