/**
 * @license SPDX-FileCopyrightText: © 2025 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// Define the Profile interface
export interface Profile {
  id: string;
  name: string;
  avatar: string | null;
}

export interface Question {
  id: string;
  title: string;
  questionText: string;
  option: string[] | null;
  profileId: string;
  isOwner?: boolean;
  latestAnswer?: Answer | null;
}

export interface Answer {
  id: string;
  profileId: string;
  optionId: string | null;
  optionAnswerList?: string[] | null;
  answerText: string | null;
  when?: string | null;
}
