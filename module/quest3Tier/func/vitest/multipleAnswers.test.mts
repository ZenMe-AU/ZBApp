/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { describe, expect, it, vi } from "vitest";
import { body, AddAnswer } from "../handler/answer/AddAnswer.mjs";

const repository = vi.hoisted(() => ({
  insertFollowUpCmd: vi.fn(async () => ({ id: "command" })),
  insertFollowUpFilter: vi.fn(async () => []),
  getAnswerListByQuestionId: vi.fn(async () => [
    { profileId: "recipient", optionId: "Pizza", optionAnswerList: ["Pizza", "Sushi"] },
    { profileId: "legacy", optionId: "Sushi", optionAnswerList: null },
    { profileId: "sender", optionId: "Sushi", optionAnswerList: ["Sushi"] },
  ]),
  shareQuestion: vi.fn(async () => []),
  updateFollowUpCmdStatus: vi.fn(async () => ({})),
  addAnswerByQuestionId: vi.fn(async () => ({ id: "answer" })),
}));

vi.mock("../repository/getRepository.mjs", () => ({ getRepository: () => repository }));
import { SendFollowUpCmd } from "../handler/followup/SendFollowUpCmd.mjs";

describe("multiple option answers", () => {
  it("accepts legacy single options and non-empty option lists", () => {
    expect(body.safeParse({ option: "Pizza", duration: 10 }).success).toBe(true);
    expect(body.safeParse({ option: ["Pizza", "Sushi"], duration: 10 }).success).toBe(true);
    expect(body.safeParse({ option: [], duration: 10 }).success).toBe(false);
    expect(body.safeParse({ option: [" "], duration: 10 }).success).toBe(false);
  });

  it("matches every selected option and supports legacy answers in follow-up filters", async () => {
    await SendFollowUpCmd({
      userData: { profileId: "sender" },
      correlationId: "correlation",
      clientParams: { newQuestionId: "follow-up", question: [{ questionId: "question", option: ["Sushi"] }] },
    }, {});
    expect(repository.shareQuestion).toHaveBeenCalledWith("follow-up", "sender", ["recipient", "legacy"]);
  });

  it("forwards multiple selections from the answer handler to the repository", async () => {
    const result = await AddAnswer({
      params: { questionId: "question" },
      userData: { profileId: "respondent" },
      clientParams: { option: ["Pizza", "Sushi"], duration: 10 },
    }, {});
    expect(result.return.id).toBe("answer");
    expect(repository.addAnswerByQuestionId).toHaveBeenCalledWith("question", "respondent", 10, null, ["Pizza", "Sushi"], undefined, null);
  });
});
