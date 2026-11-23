/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */
import type { BuddyCategory, Preference, PreferenceInput } from "./contracts.ts";

export const buddyCategories: BuddyCategory[] = ["like", "dislike", "want", "goal", "value", "boundary"];
const normalized = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// A narrow guard for explicit outcome language; broader semantic classification is
// proposed by the model and remains editable before approval.
export function classifyBuddyCategory(category: BuddyCategory, evidence: string): BuddyCategory {
  if ((category === "value" || category === "want") && /\b(?:i want to|my goal is to|i aim to|i aspire to|my ambition is to)\s+(?:become|be|achieve|earn|build|start|finish|reach|learn|save|run)\b/i.test(evidence)) return "goal";
  return category;
}

export function categoryFields(category: BuddyCategory): Pick<PreferenceInput, "kind" | "want_type"> {
  if (category === "like" || category === "dislike") return { kind: "interest" };
  if (category === "want" || category === "goal") return { kind: "want", want_type: category === "goal" ? "goal" : "wish" };
  return { kind: category };
}

export function samePreference(a: PreferenceInput, b: PreferenceInput) {
  const scope = (p: PreferenceInput) => p.personas.map(a => `${normalized(a.persona)}:${Math.sign(a.affinity)}`).sort().join("|");
  return a.kind === b.kind && (!a.want_type || !b.want_type || a.want_type === b.want_type) && scope(a) === scope(b)
    && (normalized(a.keyword) === normalized(b.keyword) || normalized(a.definition) === normalized(b.definition));
}

export function newPreferenceDuplicate(input: PreferenceInput, preferences: Preference[], current?: Preference) {
  return preferences.find(p => !p.superseded_by && p.preference_id !== current?.preference_id && samePreference(input, p)
    // Existing ambiguous records remain editable; reject newly introduced collisions.
    && (!current || !samePreference(current, p)));
}

export function similarPreferences(input: PreferenceInput, preferences: Preference[], exclude?: string): Preference[] {
  const words = (text: string) => new Set(normalized(text).split(" ").filter(w => w.length > 2));
  const query = words(input.keyword);
  return preferences.filter(p => {
    if (p.superseded_by || p.preference_id === exclude) return false;
    if (normalized(p.keyword) === normalized(input.keyword) || normalized(p.definition) === normalized(input.definition)) return true;
    const candidate = words(p.keyword);
    const overlap = [...query].filter(w => candidate.has(w)).length;
    return overlap > 0 && overlap / new Set([...query, ...candidate]).size >= 0.5;
  });
}
