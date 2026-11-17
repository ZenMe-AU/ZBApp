/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { beforeEach, describe, expect, test, vi } from "vitest";
import { randomUUID } from "node:crypto";
import container from "quest3Tier/dist/di/diContainer.mjs";
import { createAgentOperations } from "./agent-operations.mjs";
import { LIMITS } from "../agentChat.config.mjs";

vi.mock("quest3Tier/dist/handler/profileId.mjs", () => ({
  toExternalProfileId: async (id: string) => `external-${id}`,
  toInternalProfileId: async (id: string) => `internal-${id}`,
}));

const owned = randomUUID(), shared = randomUUID(), unrelated = randomUUID(), answerId = randomUUID();
const externalId = randomUUID(), otherExternalId = randomUUID();
const questionBody = { title: "Work", questionText: "Preferred work style?", option: ["Remote", "Office", "Hybrid", "Flexible"] };
let operations: ReturnType<typeof createAgentOperations>;
let repository;
const call = (method, path, body?, extra = {}) => operations.execute(`Bearer ${operations.tokens.Mike}`, { method, path, body, ...extra }, "correlation-123");

beforeEach(() => {
  repository = {
    findProfileByExternalId: vi.fn(async id => ({ id: id === externalId ? "mike" : "bella", externalId: id })),
    ensureProfile: vi.fn(async () => ({ profile: { id: "mike", externalId } })),
    canAccessQuestion: vi.fn(async id => [owned, shared].includes(id)),
    getById: vi.fn(async id => ({ id, profileId: id === owned ? "mike" : "bella" })),
    getCombinationListByUser: vi.fn(async () => [{ id: owned, profileId: "mike", latestAnswer: null }, { id: shared, profileId: "bella", latestAnswer: null }]),
    getAnswerListByQuestionId: vi.fn(async id => [{ id: answerId, questionId: id, profileId: "bella", answerCount: 2, optionAnswerList: ["Remote"] }]),
    findAnswerById: vi.fn(async () => ({ id: answerId, questionId: shared, profileId: "bella" })),
    create: vi.fn(async () => ({ id: owned })),
    updateById: vi.fn(async () => ({ id: owned })),
    patchById: vi.fn(async () => ({ id: owned })),
    addAnswerByQuestionId: vi.fn(async () => ({ id: answerId })),
    shareQuestion: vi.fn(async () => []),
    listFriends: vi.fn(async () => [{ id: "bella", path: ["mike", "bella"], degree: 1 }]),
    addFriend: vi.fn(async () => ({ id: "bella", path: ["mike", "bella"], degree: 1 })),
    insertFollowUpCmd: vi.fn(async () => ({ id: "command" })),
    insertFollowUpFilter: vi.fn(async () => []),
    updateFollowUpCmdStatus: vi.fn(async () => ({})),
  };
  container.singletons.set("repository", repository);
  operations = createAgentOperations({ Mike: externalId, Bella: otherExternalId });
});

describe("Dashboard agent operations", () => {
  test("binds identity to execution credentials and revokes them at run end", async () => {
    await expect(operations.execute("Bearer unknown", { method: "GET", path: "/questions", actor: "Mike" }, "id")).rejects.toMatchObject({ status: 403 });
    await call("GET", "/questions", undefined, { actor: "Bella", profileId: "bella" });
    expect(repository.getCombinationListByUser).toHaveBeenCalledWith("mike");
    operations.close();
    await expect(call("GET", "/questions")).rejects.toMatchObject({ status: 403 });
  });

  test("profile creation is explicit and reads report missing profiles", async () => {
    repository.findProfileByExternalId.mockResolvedValue(null);
    await expect(call("GET", "/profile/me")).rejects.toMatchObject({ status: 409 });
    expect(repository.ensureProfile).not.toHaveBeenCalled();
    expect(await call("POST", "/profile/me")).toEqual({ return: { id: externalId } });
    expect(repository.ensureProfile).toHaveBeenCalledWith(externalId, { name: "Mike" });
  });

  test("returns agent-scoped questions and answers with external author IDs", async () => {
    expect((await call("GET", "/questions")).return.list).toHaveLength(2);
    const result = await call("GET", `/question/${shared}/answers`);
    expect(result.return.list[0]).toMatchObject({ profileId: "external-bella", isEdited: true, answerCount: undefined });
    await expect(call("GET", `/question/${unrelated}/answers`)).rejects.toMatchObject({ status: 403 });
    expect(repository.getAnswerListByQuestionId).toHaveBeenCalledTimes(1);
  });

  test("denies unrelated reads, writes and mismatched answer URLs", async () => {
    await expect(call("GET", `/question/${unrelated}`)).rejects.toMatchObject({ status: 403 });
    await expect(call("GET", `/question/${owned}/answer/${answerId}`)).rejects.toMatchObject({ status: 403 });
    await expect(call("POST", `/question/${unrelated}/answer`, { option: "Remote", duration: 1 })).rejects.toMatchObject({ status: 403 });
    await expect(call("PATCH", `/question/${shared}`, questionBody)).rejects.toMatchObject({ status: 403 });
    expect(repository.addAnswerByQuestionId).not.toHaveBeenCalled();
    expect(repository.updateById).not.toHaveBeenCalled();
  });

  test("reuses validation, handlers and external-to-internal sharing IDs", async () => {
    await expect(call("POST", "/question", { ...questionBody, option: ["Only"] })).rejects.toMatchObject({ status: 400 });
    await expect(call("POST", `/question/${owned}/answer`, { option: "Remote", duration: "bad" })).rejects.toMatchObject({ name: "ZodError" });
    await call("POST", "/question", questionBody);
    expect(repository.create).toHaveBeenCalledWith("mike", "Work", questionBody.questionText, questionBody.option);
    await call("PATCH", `/question/${owned}`, [{ op: "replace", path: "/title", value: "New" }]);
    expect(repository.patchById).toHaveBeenCalledWith(owned, [{ op: "replace", path: "/title", value: "New" }], "mike");
    await call("POST", `/question/${owned}/share`, { receiverIds: [otherExternalId] });
    expect(repository.shareQuestion).toHaveBeenCalledWith(owned, "mike", [`internal-${otherExternalId}`]);
    await expect(call("POST", `/question/${shared}/share`, { receiverIds: [otherExternalId] })).rejects.toMatchObject({ status: 403 });
  });

  test("keeps write budgets per agent including concurrent requests", async () => {
    const results = await Promise.allSettled(Array.from({ length: LIMITS.questionWrites + 1 }, () => call("POST", "/question", questionBody)));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(LIMITS.questionWrites);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { status: 429 } });
    await expect(operations.execute(`Bearer ${operations.tokens.Bella}`, { method: "POST", path: "/question", body: questionBody }, "id")).resolves.toEqual({ return: { id: owned } });
  });

  test("rejects inaccessible follow-up filters or targets before any write", async () => {
    for (const [target, filter] of [[owned, unrelated], [unrelated, shared]]) {
      await expect(call("POST", "/sendFollowUpCmd", { newQuestionId: target, question: [{ questionId: filter, option: ["Remote"] }] })).rejects.toMatchObject({ status: 403 });
    }
    expect(repository.insertFollowUpCmd).not.toHaveBeenCalled();
    await call("POST", "/sendFollowUpCmd", { newQuestionId: owned, question: [{ questionId: shared, option: ["Remote"] }] });
    expect(repository.insertFollowUpCmd).toHaveBeenCalledWith("mike", expect.objectContaining({ newQuestionId: owned }), "correlation-123");
    expect(repository.shareQuestion).toHaveBeenCalledWith(owned, "mike", ["bella"]);
  });

  test("translates friendship IDs and paths and does not proxy arbitrary routes", async () => {
    expect((await call("GET", "/profile/me/friends")).return.list[0]).toMatchObject({ id: "external-bella", path: ["external-mike", "external-bella"] });
    await call("PUT", `/profile/me/friends/${otherExternalId}`);
    expect(repository.addFriend).toHaveBeenCalledWith("mike", `internal-${otherExternalId}`);
    await expect(call("GET", "/api/referee-chat")).rejects.toMatchObject({ status: 400 });
    await expect(call("POST", "https://example.com/question", questionBody)).rejects.toMatchObject({ status: 400 });
    repository.getCombinationListByUser.mockRejectedValue(new Error("Storage unavailable"));
    await expect(call("GET", "/questions")).rejects.toThrow("Storage unavailable");
  });
});
