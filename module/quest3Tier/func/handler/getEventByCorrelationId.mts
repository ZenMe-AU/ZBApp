/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { z } from "zod";
import cmdName from "../enum/cmdName.mjs";
import { apiResponses } from "./commonSchema.mjs";
import { getRepository } from "../repository/getRepository.mjs";

export const params = z.object({ name: z.enum(cmdName), correlationId: z.string() });

export const responses = apiResponses([200, 401, 403, 500], z.object({ qty: z.int() }));

export async function GetEventByCorrelationId(request, context) {
  const repository = getRepository();
  const { name, correlationId } = request.params;
  const result = await repository.getEventByCorrelationId(name, correlationId);
  return { return: { qty: result.length } };
}
