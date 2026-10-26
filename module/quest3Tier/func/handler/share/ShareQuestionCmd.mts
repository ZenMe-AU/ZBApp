/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { z } from "zod";
import { apiResponses } from "../commonSchema.mjs";
import { getRepository } from "../../repository/getRepository.mjs";

const uuid = z.uuid().refine((value) => value[14] === "4" || value[14] === "5", "Invalid UUID version");

export const headers = z.object({
  "X-Correlation-Id": z.string().optional().meta({ description: "Look up the command result with GET /getEventByCorrelationId" }),
});

export const body = z
  .strictObject({
    newQuestionId: uuid,
    receiverIds: z.array(uuid).min(1),
  })
  .meta({ id: "ShareQuestionCmd" });

export const responses = apiResponses([200, 400, 401, 403, 500], z.literal(true));

export async function ShareQuestionCmd(request, context) {
  const repository = getRepository();
  const { correlationId, clientParams: body } = request;
  const profileId = request.userData.profileId;
  const cmd = await repository.insertQuestionShareCmd(profileId, body, correlationId);
  await repository.shareQuestion(body["newQuestionId"], profileId, body["receiverIds"]);

  await repository.updateQuestionShareCmdStatus(cmd["id"]);
  return { return: true };
}
