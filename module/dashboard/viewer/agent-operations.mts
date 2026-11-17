/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { randomUUID } from "node:crypto";
import { getRepository } from "quest3Tier/dist/repository/getRepository.mjs";
import { toExternalProfileId, toInternalProfileId } from "quest3Tier/dist/handler/profileId.mjs";
import { requireQuestionAccess, requireQuestionOwner } from "quest3Tier/dist/handler/questionAccess.mjs";
import { CreateQuestion } from "quest3Tier/dist/handler/question/create.mjs";
import { body as createBody } from "quest3Tier/dist/handler/question/CreateQuestion.mjs";
import { GetQuestionListByUser } from "quest3Tier/dist/handler/question/getListByUser.mjs";
import { GetQuestionById } from "quest3Tier/dist/handler/question/getById.mjs";
import { params as questionParams } from "quest3Tier/dist/handler/question/GetQuestionById.mjs";
import { PatchQuestionById } from "quest3Tier/dist/handler/question/patchById.mjs";
import { body as updateBody } from "quest3Tier/dist/handler/question/PatchQuestionById.mjs";
import * as answers from "quest3Tier/dist/handler/answer/GetAnswerListByQuestionId.mjs";
import * as answer from "quest3Tier/dist/handler/answer/GetAnswerById.mjs";
import * as addAnswer from "quest3Tier/dist/handler/answer/AddAnswer.mjs";
import * as share from "quest3Tier/dist/handler/share/ShareQuestion.mjs";
import * as followUp from "quest3Tier/dist/handler/followup/SendFollowUpCmd.mjs";
import { invalidAction, LIMITS, writeKind } from "../agentChat.config.mjs";

const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }); };

// These credentials belong to one server-launched run, never to a caller-supplied actor ID.
export function createAgentOperations(identities: Record<string, string>) {
  const tokens: Record<string, string> = Object.fromEntries(Object.keys(identities).map(name => [name, randomUUID()]));
  const sessions = new Map(Object.entries(tokens).map(([name, token]) => [token, {
    name, externalId: identities[name], used: { questionWrites: 0, answerWrites: 0 },
  }]));
  return {
    tokens,
    close() { sessions.clear(); },
    async execute(authorization: string, input, correlationId: string) {
      const session = sessions.get(authorization?.replace(/^Bearer /, ""));
      if (!authorization?.startsWith("Bearer ") || !session) fail(403, "Active agent execution required");
      if (!input || typeof input.path !== "string" || typeof input.method !== "string") fail(400, "Invalid agent operation");
      const { method, path } = input;
      let body = input.body;
      const repository = getRepository();
      if (method === "POST" && path === "/profile/me") {
        await repository.ensureProfile(session.externalId, { name: session.name });
        return { return: { id: session.externalId } };
      }
      const profile = await repository.findProfileByExternalId(session.externalId);
      if (!profile) fail(409, "Agent profile is missing; run profile setup first");
      const request = { userData: { profileId: profile.id, externalId: session.externalId }, params: {} as Record<string, string>, clientParams: body, correlationId };
      const question = path.match(/^\/question\/([^/]+)\/?$/);
      const answerList = path.match(/^\/question\/([^/]+)\/answers\/?$/);
      const answerDetail = path.match(/^\/question\/([^/]+)\/answer\/([^/]+)\/?$/);
      const answerCreate = path.match(/^\/question\/([^/]+)\/answer\/?$/);
      const sharing = path.match(/^\/question\/([^/]+)\/share\/?$/);
      const friend = path.match(/^\/profile\/me\/friends\/([^/]+)$/);
      if (method === "GET" && path === "/profile/me") return { return: { id: session.externalId } };
      if (method === "GET" && path === "/profile/me/friends") {
        const friends = await repository.listFriends(profile.id);
        return { return: { list: await Promise.all(friends.map(async item => ({ ...item,
          id: await toExternalProfileId(item.id), path: await Promise.all(item.path.map(toExternalProfileId)),
        }))) } };
      }
      if (method === "PUT" && friend) {
        share.params.parse({ id: friend[1] });
        const result = await repository.addFriend(profile.id, await toInternalProfileId(friend[1]));
        return { return: { ...result, id: await toExternalProfileId(result.id), path: await Promise.all(result.path.map(toExternalProfileId)) } };
      }
      if (method === "GET" && path === "/questions") return GetQuestionListByUser(request, undefined);
      if (method === "GET" && path === "/sharedQuestions") {
        const questions = await repository.getSharedQuestionListByProfileId(profile.id);
        return { return: { list: await Promise.all(questions.map(async item => ({ ...item, profileId: await toExternalProfileId(item.profileId) }))) } };
      }
      if (method === "GET" && question) {
        request.params = questionParams.parse({ questionId: question[1] });
        return GetQuestionById(request as Parameters<typeof GetQuestionById>[0], undefined);
      }
      if (method === "GET" && answerList) {
        request.params = answers.params.parse({ questionId: answerList[1] });
        return answers.GetAnswerListByQuestionId(request, undefined);
      }
      if (method === "GET" && answerDetail) {
        questionParams.parse({ questionId: answerDetail[1] });
        request.params = answer.params.parse({ answerId: answerDetail[2] });
        const result = await answer.GetAnswerById(request, undefined);
        if (result.return.detail && result.return.detail.questionId !== answerDetail[1]) fail(403, "Answer does not belong to this question");
        return result;
      }
      const reason = invalidAction(method, path, body);
      if (reason) fail(400, reason);
      let handler;
      if (method === "POST" && path === "/question") {
        body = createBody.parse({ ...body, optionList: body?.option ?? null });
        handler = CreateQuestion;
      } else if (["PUT", "PATCH"].includes(method) && question) {
        request.params = questionParams.parse({ questionId: question[1] });
        body = updateBody.parse(Array.isArray(body) ? body : { ...body, optionList: body?.option ?? body?.optionList ?? null });
        handler = PatchQuestionById;
      } else if (method === "POST" && answerCreate) {
        request.params = addAnswer.params.parse({ questionId: answerCreate[1] });
        body = addAnswer.body.parse(body);
        handler = addAnswer.AddAnswer;
      } else if (method === "POST" && sharing) {
        request.params = share.params.parse({ id: sharing[1] });
        body = share.body.parse(body);
        await requireQuestionOwner(sharing[1], profile.id);
        body.receiverIds = await Promise.all((body.receiverIds ?? []).map(toInternalProfileId));
        handler = share.ShareQuestionById;
      } else if (method === "POST" && path === "/sendFollowUpCmd") {
        body = followUp.body.parse(body);
        for (const id of new Set([...(body.questionIdList ?? [body.newQuestionId]), ...body.question.map(item => item.questionId)])) {
          await requireQuestionAccess(id as string, profile.id);
        }
        handler = followUp.SendFollowUpCmd;
      } else fail(400, "Unsupported agent operation");
      if (!sessions.has(authorization.slice(7))) fail(403, "Agent execution has ended");
      const kind = writeKind(method, path);
      if (kind) {
        if (session.used[kind] >= LIMITS[kind]) fail(429, `limit:${kind}`);
        session.used[kind]++;
      }
      request.clientParams = body;
      return handler(request, undefined);
    },
  };
}
