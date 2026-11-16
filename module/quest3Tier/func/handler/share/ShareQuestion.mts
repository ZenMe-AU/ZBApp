/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { z } from "zod";
import { apiResponses } from "../commonSchema.mjs";
import { getRepository } from "../../repository/getRepository.mjs";
import { requireQuestionAccess } from "../questionAccess.mjs";

export const params = z.object({ id: z.uuid() });

export const body = z.object({ receiverIds: z.array(z.uuid()).optional() }).meta({ id: "ShareQuestionBody" });

export const responses = apiResponses([200, 400, 401, 403, 500], z.literal(true));

export async function ShareQuestionById(request, context) {
  const repository = getRepository();
  await requireQuestionAccess(request.params.id, request.userData.profileId);
  await repository.shareQuestion(request.params.id, request.userData.profileId, request.clientParams.receiverIds ?? []);
  return { return: true };
}
