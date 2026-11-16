/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { getRepository } from "../repository/getRepository.mjs";

export async function requireQuestionAccess(questionId: string, profileId: string): Promise<void> {
  if (!(await getRepository().canAccessQuestion(questionId, profileId))) {
    throw Object.assign(new Error("Question is not available to this profile"), { status: 403 });
  }
}

export async function requireQuestionOwner(questionId: string, profileId: string): Promise<void> {
  const question = await getRepository().getById(questionId);
  if (!question || question.profileId !== profileId) {
    throw Object.assign(new Error("Only the question owner can modify this question"), { status: 403 });
  }
}
