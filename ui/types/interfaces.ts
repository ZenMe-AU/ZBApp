/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// Define the Profile interface
export interface Profile {
  id: string;
  preferredUserName: string; // john.doe@example.com"
  name: string; // "John Doe"
  initials: string; // "J D"
  homeAccountId: string;
  avatar: string | null;
  role?: string;
}

export interface Question {
  id: string;
  title: string;
  questionText: string;
  option: string[] | null;
  profileId: string;
}

export interface Answer {
  id: string;
  profileId: string;
  optionAnswerList: string[] | null;
  answerText: string | null;
}
