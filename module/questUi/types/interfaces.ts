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
  optionList: string[] | null;
  profileId: string;
}

export interface Answer {
  id: string;
  profileId: string;
  optionAnswerList: string[] | null;
  answerText: string | null;
  duration: number;
  when: string | null;
}
