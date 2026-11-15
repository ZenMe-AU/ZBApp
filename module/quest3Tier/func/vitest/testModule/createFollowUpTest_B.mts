/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { test, expect } from "vitest";
import { GetEventByCorrelationId } from "../../handler/getEventByCorrelationId.mjs";
import { invokeHandler } from "./functionAppMock.mjs";

const followUpQuestionQty = 5;

const checkShareQuestion = () => {
  // Sharing tests remain disabled until shared-question fixtures are defined.
};

const checkFollowUpQty = (testCorrelationId, profileIdLookup) => {
  test("check follow up question by Correlation Id:" + testCorrelationId, async () => {
    let qty = 0;
    for (let i = 0; i < 5; i++) {
      const response = await invokeHandler(GetEventByCorrelationId, {
        userData: {
          profileId: await profileIdLookup.getProfileId(1),
        },
        params: { name: "FollowUpCmd", correlationId: testCorrelationId },
      });
      qty = response.return.qty;
      if (qty === followUpQuestionQty) break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    expect(qty).toBe(followUpQuestionQty);
  }, 100000);
};

function shareQuestionData() {
  return [
    { userId: 2, count: 1 },
    { userId: 3, count: 5 },
    { userId: 4, count: 3 },
    { userId: 5, count: 3 },
    { userId: 6, count: 5 },
    { userId: 7, count: 4 },
    { userId: 8, count: 2 },
    { userId: 9, count: 4 },
    { userId: 10, count: 4 },
    { userId: 11, count: 3 },
    { userId: 12, count: 4 },
    { userId: 13, count: 3 },
    { userId: 14, count: 2 },
    { userId: 15, count: 3 },
    { userId: 16, count: 5 },
    { userId: 17, count: 4 },
    { userId: 18, count: 4 },
    { userId: 19, count: 3 },
    { userId: 20, count: 4 },
  ];
}

export { checkShareQuestion, checkFollowUpQty };
