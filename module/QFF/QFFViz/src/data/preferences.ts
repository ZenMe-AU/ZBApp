/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { Person, Preference, PreferencePersona } from "./types";

export interface PreferenceUse {
  pref: Preference
  membership: PreferencePersona
}

export interface PersonaGroup {
  persona: string
  preferences: PreferenceUse[]
}

export function personaGroups(person: Person): PersonaGroup[] {
  const groups = new Map<string, PersonaGroup>();
  for (const persona of person.personas.personas) groups.set(persona.persona, { persona: persona.persona, preferences: [] });
  for (const pref of person.properties.preferences) {
    for (const membership of pref.personas) {
      let group = groups.get(membership.persona);
      if (!group) {
        group = { persona: membership.persona, preferences: [] };
        groups.set(membership.persona, group);
      }
      group.preferences.push({ pref, membership });
    }
  }
  return [...groups.values()];
}

export function removePreferenceUse(person: Person, use: PreferenceUse): void {
  const preferenceIndex = person.properties.preferences.indexOf(use.pref);
  if (preferenceIndex < 0) throw new Error("Preference no longer exists.");
  const index = use.pref.personas.indexOf(use.membership);
  if (index < 0) throw new Error("Preference membership no longer exists.");
  use.pref.personas.splice(index, 1);
  if (!use.pref.personas.length) {
    person.properties.preferences.splice(preferenceIndex, 1);
  }
}

export function renamePersona(person: Person, oldName: string, newName: string): string | null {
  if (!newName.trim()) return "Persona name cannot be empty.";
  if (newName === oldName) return null;
  if (person.personas.personas.some(persona => persona.persona === newName)
    || person.properties.preferences.some(pref => pref.personas.some(membership => membership.persona === newName))) {
    return "A persona with that name already exists.";
  }
  for (const pref of person.properties.preferences) {
    for (const membership of pref.personas) {
      if (membership.persona === oldName) membership.persona = newName;
    }
  }
  return null;
}
