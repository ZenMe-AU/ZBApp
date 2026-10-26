/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { test, expect } from "vitest";
import { GetAnswerListByQuestionId } from "../../handler/answer/GetAnswerListByQuestionId.mjs";
import { invokeHandler } from "./functionAppMock.mjs";

const checkAnswer = (profileIdLookup, questionIdLookup) => {
  test.each(getAnswerTestResult())("There should be $count answers for question $questionId.", async (r) => {
    const response = await invokeHandler(GetAnswerListByQuestionId, {
      userData: {
        profileId: await profileIdLookup.getProfileId(r.userId),
      },
      params: { questionId: questionIdLookup.getQuestionId(r.questionId) },
    });
    expect(response.return.list.length).toBe(r.count);
  });
};

function getAnswerTestResult() {
  return [
    {
      userId: 1,
      questionId: 1,
      count: 20,
    },
    {
      userId: 1,
      questionId: 2,
      count: 20,
    },
    {
      userId: 1,
      questionId: 3,
      count: 20,
    },
    {
      userId: 1,
      questionId: 4,
      count: 20,
    },
    {
      userId: 1,
      questionId: 5,
      count: 20,
    },
    {
      userId: 1,
      questionId: 6,
      count: 20,
    },
  ];
}

export { checkAnswer };
