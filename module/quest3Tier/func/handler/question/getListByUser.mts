/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { getRepository } from "../../repository/getRepository.mjs";
import type { QuestionRecord } from "../../repository/contracts.mjs";
import { toExternalProfileId } from "../profileId.mjs";

type GetQuestionListByUserRequest = {
  userData: { profileId: string };
};

type GetQuestionListByUserResponse = {
  return: { list: QuestionRecord[] };
};

/**
 * @swagger
 * /profile/question:
 *   get:
 *     tags:
 *       - Question
 *     summary: Get list of questions by user
 *     description: Retrieve all questions created by or shared with the authenticated user.
 *     responses:
 *       200:
 *         description: Successfully retrieved list of questions.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 return:
 *                   type: object
 *                   properties:
 *                     list:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             example: "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
 *                           profileId:
 *                             type: string
 *                             format: uuid
 *                             example: "3fa85f64-5717-4562-b3fc-2c963f66afa6"
 *                           title:
 *                             type: string
 *                             example: "Favorite Foods"
 *                           question:
 *                             type: string
 *                             example: "What is your favorite food?"
 *                           optionList:
 *                             type: array
 *                             items:
 *                               type: string
 *                             nullable: true
 *                             example: ["Pizza", "Burger", "Sushi"]
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-12-18T13:05:14.411Z"
 */
export async function GetQuestionListByUser(request: GetQuestionListByUserRequest, context: unknown): Promise<GetQuestionListByUserResponse> {
  const repository = getRepository();
  const profileId = request.userData.profileId;
  const question = await repository.getCombinationListByUser(profileId);
  return {
    return: {
      list: await Promise.all(question.map(async (item) => ({
        ...item,
        profileId: await toExternalProfileId(item.profileId),
        latestAnswer:
          item.latestAnswer && {
            ...item.latestAnswer,
            profileId: await toExternalProfileId(item.latestAnswer.profileId),
          },
        isOwner: item.profileId === profileId,
      }))),
    },
  };
}
