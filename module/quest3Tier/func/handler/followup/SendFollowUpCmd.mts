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
import cmdName from "../../enum/cmdName.mjs";
import { toExternalProfileId, toInternalProfileId } from "../profileId.mjs";

export const body = z
  .strictObject({
    newQuestionId: uuid,
    question: z
      .array(
        z.strictObject({
          questionId: uuid,
          option: z.array(z.string().min(1)).min(1),
        })
      )
      .min(1),
    // Follow-up filters are no longer stored; isSave is accepted from older clients and ignored.
    isSave: z.boolean().optional(),
  })
  .meta({ id: "SendFollowUpCmd" });

export const responses = apiResponses([200, 400, 401, 403, 500], z.literal(true));

export async function SendFollowUpCmd(request, context) {
  const repository = getRepository();
  const { correlationId, clientParams } = request;
  const profileId = request.userData.profileId;
  const questionIdList = clientParams.questionIdList ?? [clientParams.newQuestionId];
  const body = { ...clientParams, newQuestionId: questionIdList[0], questionIdList };
  const cmd = await repository.insertFollowUpCmd(profileId, body, correlationId);
  const filters = repository.insertFollowUpFilter(profileId, body);
  const receiverIds = getFollowUpReceiver(profileId, body);
  const sharedQuestions = Promise.all((await receiverIds).flatMap((receiverId) => questionIdList.map((questionId) => repository.shareQuestion(questionId, profileId, [receiverId]))));

  const settled = await Promise.allSettled([filters, sharedQuestions]);
  const errors = settled.filter((result) => result.status === "rejected").map((result) => result.reason);

  if (errors.length > 0) {
    throw new Error("Operations failed: " + errors.map((e) => e.message || e).join("; "));
  }

  await repository.updateFollowUpCmdStatus(cmd["id"]);
  return { return: true };
}

export async function getFollowUpReceiver(senderId, cmdData) {
  try {
    const repository = getRepository();
    const filterReceiverIdAry = await Promise.all(
      cmdData.question.map(async function (filter) {
        const ansList = await repository.getAnswerListByQuestionId(filter.questionId);
        return ansList.reduce((acc, ans) => {
          if (ans.profileId !== senderId && (ans.optionAnswerList ?? [ans.optionId]).some((option) => filter.option.includes(option))) {
            acc.push(ans.profileId);
          }
          return acc;
        }, []);
      })
    );
    console.log(filterReceiverIdAry);
    return filterReceiverIdAry.reduce((acc, arr) => {
      const set = new Set(arr);
      return acc.filter((item) => set.has(item));
    });
  } catch (err) {
    console.log(err);
    throw new Error(`Failed to retrieve follow-up receivers; ${err.message}`, { cause: err });
  }
}
