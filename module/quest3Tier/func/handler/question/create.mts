/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { getRepository } from "../../repository/getRepository.mjs";

type CreateQuestionRequest = {
  userData: { profileId: string };
  clientParams: {
    title?: string | null;
    optionList?: string[] | null;
    questionText: string;
  };
};

type CreateQuestionResponse = {
  return: { id: string };
};

export async function CreateQuestion(request: CreateQuestionRequest, context: unknown): Promise<CreateQuestionResponse> {
  const repository = getRepository();
  const profileId = request.userData.profileId;
  const { title = null, optionList = null, questionText } = request.clientParams;
  const questionnaire = await repository.create(profileId, title, questionText, optionList);
  return { return: { id: questionnaire.id } };
}
