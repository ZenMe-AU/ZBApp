/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { createGrid } from "ag-grid-community";
import { store } from "../data/store";
import { personaGroups, renamePersona } from "../data/preferences";
import type { Person, Persona } from "../data/types";
import { listCol, longText } from "../shared/grid";
import { personOptions, q } from "../shared/dom";

interface Row {
  owner: Person
  persona: Persona
}

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <h2>Personas</h2>
    <p class="hint">One row per scripted persona in the optional <code>*-test-context.json</code>. List cells hold one item per line. Renaming a persona also renames its labels in the properties draft.</p>
    <div class="toolbar">
      <input class="search" placeholder="Quick filter…" />
      <select class="owner">${personOptions()}</select>
      <button class="add">Add persona</button>
      <button class="delete danger">Delete selected</button>
    </div>
    <div class="fill"></div>`;

  const rows: Row[] = store.people.flatMap(owner => owner.personas.personas.map(persona => ({ owner, persona })));

  const api = createGrid<Row>(q(root, ".fill"), {
    rowData: rows,
    rowSelection: { mode: "multiRow" },
    defaultColDef: { editable: true, filter: true, minWidth: 160, flex: 1 },
    columnDefs: [
      { headerName: "Identity", valueGetter: p => p.data!.owner.identity.name, editable: false, pinned: "left" },
      {
        field: "persona.persona", headerName: "Persona", pinned: "left",
        valueSetter: (params) => {
          const next = String(params.newValue ?? "");
          const error = renamePersona(params.data.owner, params.data.persona.persona, next);
          if (error) {
            alert(error);
            return false;
          }
          params.data.persona.persona = next;
          store.touch(params.data.owner.properties);
          return true;
        },
      },
      { field: "persona.connection_goal", headerName: "Connection goal", ...longText },
      { field: "persona.motivation", headerName: "Motivation", ...longText },
      listCol("persona.contributions", "Contributions"),
      listCol("persona.expectations", "Expectations"),
      listCol("persona.important_interests_and_values", "Interests & values"),
      { field: "persona.communication_style", headerName: "Communication style", ...longText },
      listCol("persona.boundaries", "Boundaries"),
      { field: "persona.initial_disclosure", headerName: "Initial disclosure", ...longText },
    ],
    onCellValueChanged: (e) => {
      const { owner } = e.data;
      store.touch(owner.personas);
    },
  });

  q<HTMLInputElement>(root, ".search").addEventListener("input", e =>
    api.setGridOption("quickFilterText", (e.target as HTMLInputElement).value),
  );

  q(root, ".add").addEventListener("click", () => {
    const owner = store.person(q<HTMLSelectElement>(root, ".owner").value)!;
    const names = new Set(personaGroups(owner).map(group => group.persona));
    let name = "new persona";
    let suffix = 2;
    while (names.has(name)) name = `new persona ${suffix++}`;
    const persona: Persona = {
      persona: name,
      connection_goal: "",
      motivation: "",
      contributions: [],
      expectations: [],
      important_interests_and_values: [],
      communication_style: "",
      boundaries: [],
      initial_disclosure: "",
    };
    owner.personas.personas.push(persona);
    store.touch(owner.personas);
    api.applyTransaction({ add: [{ owner, persona }] });
  });

  q(root, ".delete").addEventListener("click", () => {
    const selected = api.getSelectedRows();
    if (!selected.length || !confirm(`Delete ${selected.length} persona(s)? Preferences in properties files are kept.`)) return;
    for (const row of selected) {
      row.owner.personas.personas.splice(row.owner.personas.personas.indexOf(row.persona), 1);
      store.touch(row.owner.personas);
    }
    api.applyTransaction({ remove: selected });
  });

  return () => api.destroy();
}
