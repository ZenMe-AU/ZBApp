/**
 * @license SPDX-FileCopyrightText: © 2025 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// This is the public interface for the repository layer, defining the data structures for Profile, Question, and Answer.
// It specifically does not expose any internal data store details like sequelize or datatables, ensuring a clean separation between the repository layer and the underlying database implementation.

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
  optionId: string | null;
  answerText: string | null;
}
