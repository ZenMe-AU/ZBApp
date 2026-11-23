/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */
import type { PreferenceInput } from "./contracts.ts";

export type FieldErrors = Record<string, string>;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

// Shared by the editor and repository; UI wording stays the same at both boundaries.
export function preferenceErrors(input: unknown): FieldErrors {
  if (!record(input)) return { keyword: "Enter a Title and Description for this preference." };
  const errors: FieldErrors = {};
  if (Object.keys(input).some(key => !["keyword", "definition", "kind", "personas", "want_type"].includes(key))) errors._form = "Only editable preference fields can be saved.";
  for (const [key, label, limit] of [["keyword", "Title", 120], ["definition", "Description", 4000]] as const) {
    const value = input[key];
    if (typeof value !== "string" || !value.trim()) errors[key] = `Enter a ${label}. Spaces alone are not enough.`;
    else if (value.length > limit) errors[key] = `${label} must be ${limit} characters or fewer.`;
  }
  if (typeof input.kind !== "string" || !["interest", "want", "value", "boundary"].includes(input.kind)) errors.kind = "Choose a valid Category.";
  if (input.want_type !== undefined && (input.kind !== "want" || typeof input.want_type !== "string" || !["wish", "goal"].includes(input.want_type))) errors.kind = "Choose Want or Goal within the Wants & goals category.";
  if (!Array.isArray(input.personas) || input.personas.length > 50) errors.personas = "Use up to 50 Context rows.";
  else {
    const names = new Map<string, number>();
    input.personas.forEach((entry: unknown, index: number) => {
      const key = `personas.${index}`;
      if (!record(entry)) { errors[`${key}.persona`] = "Enter a valid Context."; return; }
      if (Object.keys(entry).some(k => !["persona", "affinity"].includes(k))) errors[`${key}.persona`] = "Only Context and Affinity can be saved in this row.";
      if (typeof entry.persona !== "string" || entry.persona.length > 120) errors[`${key}.persona`] = "Context must be 120 characters or fewer.";
      else {
        const name = entry.persona.trim().normalize("NFKC").toLowerCase();
        const previous = names.get(name);
        if (previous !== undefined) {
          errors[`personas.${previous}.persona`] = errors[`${key}.persona`] = "This Context is repeated. Use each Context only once.";
        } else names.set(name, index);
      }
      if (typeof entry.affinity !== "number" || !Number.isFinite(entry.affinity) || Math.abs(entry.affinity) > 1) errors[`${key}.affinity`] = "Affinity must be between −1 and 1.";
    });
  }
  return errors;
}

export function trimmedPreference(input: PreferenceInput): PreferenceInput {
  return { ...input, keyword: input.keyword.trim(), definition: input.definition.trim(), personas: input.personas.map(a => ({ ...a, persona: a.persona.trim() })) };
}
