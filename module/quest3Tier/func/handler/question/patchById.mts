/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { getRepository } from "../../repository/getRepository.mjs";

type PatchQuestionByIdRequest = {
  params: { questionId: string };
  userData: { profileId: string };
  clientParams: unknown;
};

type PatchQuestionByIdResponse = {
  return: { id: string };
};

/**
 * @swagger
 * /questionCmd/updateQuestion/{questionId}:
 *   post:
 *     tags:
 *       - Question
 *     summary: Update a question using JSON Patch
 *     description: Apply JSON Patch operations to update a question's data. Changes are recorded in the question_action table.
 *     parameters:
 *       - name: questionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "123e4567-e89b-12d3-a456-426614174000"
 *         description: The UUID of the question to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json-patch+json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               properties:
 *                 op:
 *                   type: string
 *                   enum: [add, remove, replace, move, copy, test]
 *                   description: The operation to perform.
 *                 path:
 *                   type: string
 *                   description: The JSON Pointer path to the field to operate on.
 *                   example: "/title"
 *                 value:
 *                   type: string
 *                   description: The value to set (required for `add` and `replace` operations).
 *                   example: "Updated Title"
 *     responses:
 *       200:
 *         description: Successfully queued patch operation.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 return:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: The unique identifier of the created question_action record.
 *                       example: "b08992c2-7c89-43a6-a152-9d24a74349a7"
 */
export async function PatchQuestionById(request: PatchQuestionByIdRequest, context: unknown): Promise<PatchQuestionByIdResponse> {
  const repository = getRepository();
  const profileId = request.userData.profileId;
  const { questionId } = request.params;
  if (!Array.isArray(request.clientParams)) {
    const { title = null, questionText, optionList = null } = request.clientParams as { title?: string | null; questionText: string; optionList?: string[] | null };
    const question = await repository.updateById(questionId, title, questionText, optionList);
    return { return: { id: question.id } };
  }
  const questionAction = await repository.patchById(questionId, request.clientParams, profileId);
  return { return: { id: questionAction.id } };
}
