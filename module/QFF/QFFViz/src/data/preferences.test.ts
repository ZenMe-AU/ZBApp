/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { describe, expect, it } from "vitest";
import { personaGroups, removePreferenceUse, renamePersona } from "./preferences";
import { itemsFor } from "../shared/sets";
import type { Person } from "./types";

function fixture(): Person {
  const persona = (name: string) => ({
    persona: name, connection_goal: "", motivation: "", contributions: [], expectations: [],
    important_interests_and_values: [], communication_style: "", boundaries: [], initial_disclosure: "",
  });
  return {
    id: "test", folder: "test",
    identity: { identity_id: "test", name: "Test", age: 0, gender: "", location: "", occupation: "", summary: "" },
    personas: { identity_id: "test", personas: [persona("Friends"), persona("Work")] },
    properties: {
      identity_id: "test", embedding_model: { name: "test", version: "1", dimensions: 2 },
      preferences: [{
        keyword: "Music", definition: "Music", kind: "interest", embedding: [1, 0],
        personas: [{ persona: "Friends", affinity: 0.8 }, { persona: "Work", affinity: -0.5 }],
      }],
    },
    relations: { identity_id: "test", relations: [] },
  };
}

describe("shared preference memberships", () => {
  it("uses each persona's affinity and removes only the selected membership", () => {
    const person = fixture();
    const groups = personaGroups(person);
    expect(groups.map(group => group.preferences[0].membership.affinity)).toEqual([0.8, -0.5]);
    expect(itemsFor(person, "positive")).toEqual(["music"]);
    expect(itemsFor(person, "negative")).toEqual(["music"]);
    removePreferenceUse(person, groups[0].preferences[0]);
    expect(person.properties.preferences).toHaveLength(1);
    expect(person.properties.preferences[0].personas).toEqual([{ persona: "Work", affinity: -0.5 }]);
    expect(() => removePreferenceUse(person, groups[0].preferences[0])).toThrow("membership no longer exists");
    expect(person.properties.preferences[0].personas).toHaveLength(1);
    removePreferenceUse(person, groups[1].preferences[0]);
    expect(person.properties.preferences).toHaveLength(0);
  });

  it("renames every membership and rejects empty or conflicting persona names", () => {
    const person = fixture();
    person.properties.preferences.push({
      keyword: "Reading", kind: "interest", embedding: null, personas: [{ persona: "Friends", affinity: 0.2 }],
    });
    expect(renamePersona(person, "Friends", "")).toMatch(/cannot be empty/);
    expect(renamePersona(person, "Friends", "Work")).toMatch(/already exists/);
    expect(person.properties.preferences[0].personas[0].persona).toBe("Friends");
    expect(renamePersona(person, "Friends", "Social")).toBeNull();
    expect(person.properties.preferences[0].personas[0]).toEqual({ persona: "Social", affinity: 0.8 });
    expect(person.properties.preferences[1].personas[0]).toEqual({ persona: "Social", affinity: 0.2 });
    person.properties.preferences.length = 0;
    expect(renamePersona(person, "Friends", "Social")).toBeNull();
  });
});
