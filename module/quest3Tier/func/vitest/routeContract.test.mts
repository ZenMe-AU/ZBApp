/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRequest, InvocationContext } from "@azure/functions";
import type { HttpResponseInit } from "@azure/functions";
import type { z } from "zod";
import container from "../di/diContainer.mjs";

type RouteContract = {
  route: string;
  methods: string[];
  params?: z.ZodType;
  body?: z.ZodType;
  headers?: z.ZodType;
  request?: {
    params: z.ZodType;
    headers: z.ZodType;
    body: { content: Record<string, { schema: z.ZodType }> };
  };
  responses: { httpCode: number; schema: z.ZodType }[];
  handler: (request: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>;
};

const { register, repository, toExternalProfileId, toInternalProfileId } = vi.hoisted(() => ({
  register: vi.fn<(name: string, summary: string, options: RouteContract) => void>(),
  toExternalProfileId: vi.fn(),
  toInternalProfileId: vi.fn(),
  repository: {
    canAccessQuestion: vi.fn(),
    ensureProfile: vi.fn(),
    getCombinationListByUser: vi.fn(async () => []),
    getSharedQuestionListByProfileId: vi.fn(async () => []),
    getAnswerListByQuestionId: vi.fn(async () => []),
    getById: vi.fn(async () => null),
    findAnswerById: vi.fn(async () => null),
    getEventByCorrelationId: vi.fn(async () => [{}, {}]),
    addAnswerByQuestionId: vi.fn(async () => ({ id: "answer" })),
    patchById: vi.fn(async () => ({ id: "action" })),
    updateById: vi.fn(async () => ({ id: "question" })),
    shareQuestion: vi.fn(async () => []),
    insertQuestionShareCmd: vi.fn(async () => ({ id: "command" })),
    updateQuestionShareCmdStatus: vi.fn(async () => ({ id: "command" })),
  },
}));

vi.mock("../swagger/openapi.mjs", () => ({}));
vi.mock("@azure/functions", async (importOriginal) => ({
  ...await importOriginal<typeof import("@azure/functions")>(),
  app: { openAPIPath: register },
}));
vi.mock("../repository/getRepository.mjs", () => ({ getRepository: () => repository }));
vi.mock("../handler/profileId.mjs", () => ({ toExternalProfileId, toInternalProfileId }));

await import("../route.mjs");
const registrations = new Map(register.mock.calls.map(([name, , options]) => [name, options]));

const questionId = "63fddfe4-b1c2-4314-a65c-f4f3fba185b6";
const externalId = "8bc796d2-4731-4d0b-8299-1d1a067c4be7";
const internalId = "33919184-6de4-4271-86a6-dc55f67877ae";
const otherId = "5d6f0b1e-2c3a-4b7d-9e8f-1a2b3c4d5e6f";
const correlationId = "0123456789abcdef0123456789abcdef";
const commands = ["CreateQuestion", "PatchQuestionById", "AddAnswer", "SendFollowUpCmd", "ShareQuestionCmd"];

function route(name: string) {
  const registration = registrations.get(name);
  if (!registration) throw new Error(`Missing route: ${name}`);
  return registration;
}

async function invoke(name: string, params: Record<string, string> = {}, body?: unknown, contentType = "application/json", authenticated = true) {
  const options = route(name);
  return options.handler(new HttpRequest({
    method: options.methods[0],
    url: `http://localhost/${options.route}`,
    params,
    headers: {
      ...(authenticated ? { authorization: "Bearer test-token" } : {}),
      "X-Correlation-Id": correlationId,
      ...(body === undefined ? {} : { "content-type": contentType }),
      "x-profile-id": externalId,
    },
    ...(body === undefined ? {} : { body: { string: JSON.stringify(body) } }),
  }), new InvocationContext({ functionName: name }));
}

describe("Q3 route contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    repository.ensureProfile.mockResolvedValue({ profile: { id: internalId, externalId }, created: false });
    toExternalProfileId.mockResolvedValue(externalId);
    toInternalProfileId.mockResolvedValue(internalId);
    repository.canAccessQuestion.mockResolvedValue(true);
    repository.getById.mockResolvedValue({ profileId: internalId });
    container.singletons.set("authProvider", { decode: vi.fn().mockResolvedValue({ oid: externalId }) });
  });

  it("registers the twelve Q5Eg HTTP paths with authenticated-caller list routes", () => {
    const expected = [
      ["GetQuestionById", "GET", "questionQry/getQuestion/{questionId}"],
      ["GetAnswerById", "GET", "questionQry/getAnswer/{answerId}"],
      ["GetQuestionListByUser", "GET", "questionQry/getQuestions"],
      ["GetAnswerListByQuestionId", "GET", "questionQry/getAnswers/{questionId}"],
      ["GetSharedQuestionList", "GET", "questionQry/getSharedQuestions"],
      ["GetQuestionShareEventList", "GET", "questionQry/getQuestionShareEvents/{correlationId}"],
      ["GetFollowUpEventList", "GET", "questionQry/getFollowUpEvents/{correlationId}"],
      ["CreateQuestion", "POST", "questionCmd/createQuestion"],
      ["PatchQuestionById", "POST", "questionCmd/updateQuestion/{questionId}"],
      ["AddAnswer", "POST", "questionCmd/createAnswer/{questionId}"],
      ["SendFollowUpCmd", "POST", "questionCmd/sendFollowUp"],
      ["ShareQuestionCmd", "POST", "questionCmd/shareQuestion"],
    ];
    for (const [name, method, path] of expected) {
      expect(route(name)).toMatchObject({ route: path, methods: [method] });
    }
  });

  it.each(commands)("declares messageId acknowledgements for %s without accepting old response shapes", (name) => {
    const response = route(name).responses.find(({ httpCode }) => httpCode === 200);
    expect(response).toBeDefined();
    expect(response?.schema.safeParse({ success: true, return: { messageId: questionId } }).success).toBe(true);
    expect(response?.schema.safeParse({ success: true, return: { id: questionId } }).success).toBe(false);
    expect(response?.schema.safeParse({ success: true, return: true }).success).toBe(false);
    expect((route(name).headers ?? route(name).request?.headers)?.safeParse({}).success).toBe(true);
  });

  it("uses the token external ID to resolve the caller for both list queries", async () => {
    await invoke("GetQuestionListByUser", { profileId: externalId });
    await invoke("GetSharedQuestionList", { profileId: externalId });
    expect(repository.ensureProfile).toHaveBeenCalledWith(externalId, { name: undefined });
    expect(repository.getCombinationListByUser).toHaveBeenCalledWith(internalId);
    expect(repository.getSharedQuestionListByProfileId).toHaveBeenCalledWith(internalId);
  });

  it("passes questionId through query and answer registrations", async () => {
    await invoke("GetQuestionById", { questionId });
    await invoke("GetAnswerListByQuestionId", { questionId });
    await invoke("AddAnswer", { questionId }, { answer: "yes", duration: 10 });
    expect(repository.getById).toHaveBeenCalledWith(questionId);
    expect(repository.getAnswerListByQuestionId).toHaveBeenCalledWith(questionId);
    expect(repository.addAnswerByQuestionId).toHaveBeenCalledWith(questionId, internalId, 10, "yes", null, null);
  });

  it("returns external profile IDs for answer lists until pairwise IDs are available", async () => {
    repository.getAnswerListByQuestionId.mockResolvedValueOnce([{
      id: questionId,
      questionId,
      profileId: internalId,
      answerText: null,
      optionAnswerList: ["yes"],
      when: null,
      duration: 10,
      createdAt: "2026-10-26T00:00:00.000Z",
      answerCount: 2,
    }]);

    const response = await invoke("GetAnswerListByQuestionId", { questionId });

    expect(toExternalProfileId).toHaveBeenCalledWith(internalId);
    expect(response.jsonBody).toMatchObject({
      success: true,
      return: { list: [{ profileId: externalId, isEdited: true }] },
    });
  });

  it("returns 403 for answer lists to callers who neither own nor received the question", async () => {
    repository.canAccessQuestion.mockResolvedValueOnce(false);

    const response = await invoke("GetAnswerListByQuestionId", { questionId });

    expect(repository.canAccessQuestion).toHaveBeenCalledWith(questionId, internalId);
    expect(response.status).toBe(403);
    expect(repository.getAnswerListByQuestionId).not.toHaveBeenCalled();
  });

  const callers = {
    "owner": { questionOwnerId: internalId, canAccess: true },
    "share recipient": { questionOwnerId: otherId, canAccess: true },
    "unrelated user": { questionOwnerId: otherId, canAccess: false },
  } as const;
  const accessRequests: Record<string, [Record<string, string>, unknown?]> = {
    GetQuestionById: [{ questionId }],
    GetAnswerListByQuestionId: [{ questionId }],
    GetAnswerById: [{ answerId: questionId }],
    AddAnswer: [{ questionId }, { answer: "yes", duration: 10 }],
    PatchQuestionById: [{ questionId }, { questionText: "Updated?", optionList: ["yes"] }],
    UpdateQuestionById: [{ id: questionId }, { questionText: "Updated?", optionList: ["yes"] }],
    ShareQuestion: [{ id: questionId }, { receiverIds: [externalId] }],
    ShareQuestionCmd: [{}, { newQuestionId: questionId, receiverIds: [externalId] }],
  };

  it.each([
    ["GetQuestionById", "owner", 200],
    ["GetQuestionById", "share recipient", 200],
    ["GetQuestionById", "unrelated user", 403],
    ["GetAnswerListByQuestionId", "owner", 200],
    ["GetAnswerListByQuestionId", "share recipient", 200],
    ["GetAnswerListByQuestionId", "unrelated user", 403],
    ["GetAnswerById", "owner", 200],
    ["GetAnswerById", "share recipient", 200],
    ["GetAnswerById", "unrelated user", 403],
    ["AddAnswer", "owner", 200],
    ["AddAnswer", "share recipient", 200],
    ["AddAnswer", "unrelated user", 403],
    ["PatchQuestionById", "owner", 200],
    ["PatchQuestionById", "share recipient", 403],
    ["PatchQuestionById", "unrelated user", 403],
    ["UpdateQuestionById", "owner", 200],
    ["UpdateQuestionById", "share recipient", 403],
    ["UpdateQuestionById", "unrelated user", 403],
    ["ShareQuestion", "owner", 200],
    ["ShareQuestion", "share recipient", 200],
    ["ShareQuestion", "unrelated user", 403],
    ["ShareQuestionCmd", "owner", 200],
    ["ShareQuestionCmd", "share recipient", 200],
    ["ShareQuestionCmd", "unrelated user", 403],
  ] as const)("%s for the %s returns %i", async (name, caller, status) => {
    const { questionOwnerId, canAccess } = callers[caller];
    repository.getById.mockResolvedValue({ profileId: questionOwnerId });
    repository.findAnswerById.mockResolvedValue({ questionId, profileId: otherId });
    repository.canAccessQuestion.mockResolvedValue(canAccess);
    const [params, body] = accessRequests[name];

    const response = await invoke(name, params, body);
    expect(response.status).toBe(status);
    if (status === 403) {
      for (const operation of [
        repository.addAnswerByQuestionId, repository.patchById, repository.updateById,
        repository.shareQuestion, repository.insertQuestionShareCmd, repository.updateQuestionShareCmdStatus,
      ]) expect(operation).not.toHaveBeenCalled();
      expect(response.jsonBody).toMatchObject({ success: false });
      expect(toExternalProfileId).not.toHaveBeenCalled();
    }
  });

  it("checks the stored question ID when looking up an answer by answer ID alone", async () => {
    repository.findAnswerById.mockResolvedValue({ questionId: otherId, profileId: internalId });
    await invoke("GetAnswerById", { answerId: questionId });
    expect(repository.findAnswerById).toHaveBeenCalledWith(questionId);
    expect(repository.canAccessQuestion).toHaveBeenCalledWith(otherId, internalId);
  });

  it("returns null for a missing answer", async () => {
    const response = await invoke("GetAnswerById", { answerId: questionId });
    expect(response.jsonBody).toMatchObject({ return: { detail: null } });
    expect(repository.canAccessQuestion).not.toHaveBeenCalled();
  });

  it("fails closed if the permission lookup fails", async () => {
    repository.canAccessQuestion.mockRejectedValueOnce(new Error("Storage unavailable"));
    expect((await invoke("AddAnswer", { questionId }, { answer: "yes", duration: 1 })).status).toBe(500);
    expect(repository.addAnswerByQuestionId).not.toHaveBeenCalled();
  });

  it("does not patch a missing question", async () => {
    repository.getById.mockResolvedValueOnce(null);
    expect((await invoke("PatchQuestionById", { questionId }, [{ op: "replace", path: "/title", value: "x" }])).status).toBe(403);
    expect(repository.patchById).not.toHaveBeenCalled();
  });

  it.each([
    "GetAnswerListByQuestionId",
    "GetQuestionById",
    "GetAnswerById",
    "CreateQuestion",
    "UpdateQuestionById",
    "PatchQuestionById",
    "AddAnswer",
    "ShareQuestion",
    "ShareQuestionCmd",
    "UpdateMyProfile",
    "AddMyFriend",
  ])("returns 401 for %s without a token", async (name) => {
    expect((await invoke(name, {}, undefined, "application/json", false)).status).toBe(401);
  });

  it.each([
    { contentType: "application/json-patch+json", body: [{ op: "replace", path: "/title", value: "Updated" }] },
    { contentType: "application/json", body: { questionText: "Updated?", optionList: ["yes"] } },
  ])("documents and accepts updates as $contentType", async ({ contentType, body }) => {
    expect(route("PatchQuestionById").request?.body.content[contentType].schema.safeParse(body).success).toBe(true);
    const response = await invoke("PatchQuestionById", { questionId }, body, contentType);
    expect(response.status).toBe(200);
    if (Array.isArray(body)) {
      expect(repository.patchById).toHaveBeenCalledWith(questionId, body, internalId);
    } else {
      expect(repository.updateById).toHaveBeenCalledWith(questionId, null, "Updated?", ["yes"]);
    }
  });

  it.each([
    ["GetQuestionShareEventList", "QuestionShareCmd"],
    ["GetFollowUpEventList", "FollowUpCmd"],
  ])("maps %s to its fixed event type", async (name, eventName) => {
    const response = await invoke(name, { correlationId, name: "untrusted" });
    expect(repository.getEventByCorrelationId).toHaveBeenCalledWith(eventName, correlationId);
    expect(response.jsonBody).toEqual({ success: true, return: { qty: 2 } });
    expect(response.headers).toEqual({ "X-Correlation-Id": correlationId });
  });

  it("retains the generic event lookup", async () => {
    await invoke("getEventByCorrelationId", { name: "FollowUpCmd", correlationId });
    expect(repository.getEventByCorrelationId).toHaveBeenCalledWith("FollowUpCmd", correlationId);
  });

  it("rejects invalid question IDs and unauthenticated calls before repository access", async () => {
    expect((await invoke("GetAnswerListByQuestionId", { questionId: "invalid" })).status).toBe(400);
    expect((await invoke("GetQuestionListByUser", {}, undefined, "application/json", false)).status).toBe(401);
    expect(repository.getAnswerListByQuestionId).not.toHaveBeenCalled();
    expect(repository.getCombinationListByUser).not.toHaveBeenCalled();
  });

  it("accepts authenticated share/follow-up payloads and rejects caller profile fields", () => {
    const payloads = [
      ["ShareQuestionCmd", { newQuestionId: questionId, receiverIds: [externalId] }],
      ["SendFollowUpCmd", { questionIdList: [questionId], question: [{ questionId, option: ["yes"] }], isSave: true }],
    ] as const;
    for (const [name, body] of payloads) {
      expect(route(name).body?.safeParse(body).success).toBe(true);
      expect(route(name).body?.safeParse({ ...body, profileId: externalId }).success).toBe(false);
    }
  });
});
