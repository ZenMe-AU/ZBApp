/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { getRepository } from "../../repository/getRepository.mjs";

type UpdateQuestionByIdRequest = {
  params: { id: string };
  clientParams: {
    title?: string | null;
    optionList?: string[] | null;
    questionText: string;
  };
};

type UpdateQuestionByIdResponse = {
  return: { id: string };
};

/**
 * @swagger
 * /question/{id}:
 *   put:
 *     tags:
 *       - Question
 *     summary: Update a question
 *     description: Update the title, question text, or options of a specific question.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *         description: The ID of the question to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 nullable: true
 *                 description: The new title of the question (optional).
 *                 example: "Updated Favorite Foods"
 *               questionText:
 *                 type: string
 *                 description: The updated question text.
 *                 example: "What is your updated favorite food?"
 *               optionList:
 *                 type: array
 *                 items:
 *                   type: string
 *                 nullable: true
 *                 description: Updated options for the question (optional).
 *                 example: ["Pizza", "Burger", "Sushi", "Pasta"]
 *     responses:
 *       200:
 *         description: Successfully updated the question.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 return:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       description: The ID of the updated question.
 *                       example: 1
 */
export async function UpdateQuestionById(request: UpdateQuestionByIdRequest, context: unknown): Promise<UpdateQuestionByIdResponse> {
  const repository = getRepository();
  const { id: questionId } = request.params;
  const { title = null, optionList = null, questionText } = request.clientParams;
  const question = await repository.updateById(questionId, title, questionText, optionList);
  return { return: { id: question.id } };
}
