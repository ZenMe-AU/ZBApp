/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { test, expect } from "vitest";
import { SendFollowUpCmd } from "../../handler/followup/SendFollowUpCmd.mjs";
import { invokeHandler } from "./functionAppMock.mjs";

const createFollowUp = (profileIdLookup, questionIdLookup, testCorrelationId) => {
  test.each(followUpData())("send follow-up question by user $userId", async (followUp) => {
    const response = await invokeHandler(SendFollowUpCmd, {
      userData: {
        profileId: await profileIdLookup.getProfileId(followUp.userId),
      },
      correlationId: testCorrelationId,
      clientParams: {
        newQuestionId: questionIdLookup.getQuestionId(followUp.newQuestionId),
        question: [{ questionId: questionIdLookup.getQuestionId(followUp.questionId), option: [followUp.option] }],
        isSave: followUp.isSave,
      },
    });
    expect(response).toEqual({ return: true });
  });
};

function followUpData() {
  return [
    // Question 1: Taiwan's Capital City
    {
      userId: 1,
      newQuestionId: 2,
      questionId: 1,
      option: "Taipei",
      isSave: true,
    },
    // Question 2: Taiwan's Tallest Peak
    {
      userId: 1,
      newQuestionId: 3,
      questionId: 2,
      option: "Yushan",
      isSave: true,
    },
    // Question 3: Sky Lantern Festival
    {
      userId: 1,
      newQuestionId: 4,
      questionId: 3,
      option: "Pingxi",
      isSave: true,
    },
    // Question 4: Taiwan’s Indigenous Languages
    {
      userId: 1,
      newQuestionId: 5,
      questionId: 4,
      option: "Austronesian",
      isSave: true,
    },
    // Question 5: Temple Culture in Taiwan
    {
      userId: 1,
      newQuestionId: 1,
      questionId: 5,
      option: "Mazu",
      isSave: true,
    },
  ];
}

export { createFollowUp };
