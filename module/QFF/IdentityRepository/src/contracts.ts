/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

export type PreferenceKind = "interest" | "want" | "value" | "boundary";
export interface Affinity { persona: string; affinity: number }
export interface PreferenceInput {
  keyword: string;
  definition: string;
  kind: PreferenceKind;
  personas: Affinity[];
  want_type?: "wish" | "goal";
}
export interface Preference extends PreferenceInput {
  preference_id: string;
  superseded_by?: string;
  supersedes?: string;
  buddy_approval?: { proposal_id: string; approved_at: string };
}
export interface PersonalDetail { label: string; value: string }
export interface Identity {
  identity_id: string;
  name?: string;
  age?: number;
  gender?: string;
  location?: string;
  occupation?: string;
  summary?: string;
  details?: PersonalDetail[];
  personas?: { name: string; description: string }[];
}
export interface ProfileSnapshot {
  revision: string;
  identity_revision: string;
  profile_revision: string;
  profile: {
    identity: Identity;
    properties: { identity_id: string; preferences: Preference[] };
    relations: unknown;
  };
}

export type BuddyCategory = "like" | "dislike" | "want" | "goal" | "value" | "boundary";
export interface BuddyMessage { role: "user" | "assistant"; content: string }
export interface BuddyProposal {
  proposal_id: string;
  revision: string;
  category: BuddyCategory;
  preference: PreferenceInput;
  evidence: string;
  reason: string;
  source?: Preference;
  similar: Preference[];
}
export type BuddyMode = "chat" | "diary";
export type DiaryFocus = "today" | "future";
export interface BuddyTurn {
  request_id: string;
  content: string;
  created_at: string;
  status: "processing" | "complete" | "failed";
  reply?: string;
  error?: string;
  generation_id?: string;
  started_at?: string;
}
export interface BuddyConversation {
  conversation_id: string;
  title: string;
  mode: BuddyMode;
  diary_date?: string;
  diary_focus?: DiaryFocus;
  created_at: string;
  updated_at: string;
  turns: BuddyTurn[];
}
export interface SavedBuddyProposal extends BuddyProposal {
  conversation_id: string;
  request_id: string;
  created_at: string;
  status: "pending" | "approved" | "dismissed";
  preference_id?: string;
}
export interface BuddyMemory {
  version: 1;
  identity_id: string;
  conversations: BuddyConversation[];
  proposals: SavedBuddyProposal[];
}
export interface BuddyMemorySnapshot { revision: string; memory: BuddyMemory }
export interface BuddyReply {
  conversation_id: string;
  request_id: string;
  reply?: string;
  error?: string;
  proposals: SavedBuddyProposal[];
}
export interface BuddyAvailability { available: boolean; reason?: string }
