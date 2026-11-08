import { createGrid } from 'ag-grid-community';
import { store } from '../data/store';
import type { Person, Persona } from '../data/types';
import { listCol, longText } from '../shared/grid';
import { personOptions, q } from '../shared/dom';

interface Row {
  owner: Person;
  persona: Persona;
}

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <h2>Personas</h2>
    <p class="hint">One row per persona in <code>*-personas.json</code>. List cells hold one item per line. Renaming a persona also renames it in the matching properties file.</p>
    <div class="toolbar">
      <input class="search" placeholder="Quick filter…" />
      <select class="owner">${personOptions()}</select>
      <button class="add">Add persona</button>
      <button class="delete danger">Delete selected</button>
    </div>
    <div class="fill"></div>`;

  const rows: Row[] = store.people.flatMap((owner) => owner.personas.personas.map((persona) => ({ owner, persona })));

  const api = createGrid<Row>(q(root, '.fill'), {
    rowData: rows,
    rowSelection: { mode: 'multiRow' },
    defaultColDef: { editable: true, filter: true, minWidth: 160, flex: 1 },
    columnDefs: [
      { headerName: 'Identity', valueGetter: (p) => p.data!.owner.identity.name, editable: false, pinned: 'left' },
      { field: 'persona.persona', headerName: 'Persona', pinned: 'left' },
      { field: 'persona.connection_goal', headerName: 'Connection goal', ...longText },
      { field: 'persona.motivation', headerName: 'Motivation', ...longText },
      listCol('persona.contributions', 'Contributions'),
      listCol('persona.expectations', 'Expectations'),
      listCol('persona.important_interests_and_values', 'Interests & values'),
      { field: 'persona.communication_style', headerName: 'Communication style', ...longText },
      listCol('persona.boundaries', 'Boundaries'),
      { field: 'persona.initial_disclosure', headerName: 'Initial disclosure', ...longText },
    ],
    onCellValueChanged: (e) => {
      const { owner } = e.data;
      if (e.colDef.field === 'persona.persona') {
        const props = owner.properties.personas.find((g) => g.persona === e.oldValue);
        if (props) {
          props.persona = e.newValue;
          store.touch(owner.properties);
        }
      }
      store.touch(owner.personas);
    },
  });

  q<HTMLInputElement>(root, '.search').addEventListener('input', (e) =>
    api.setGridOption('quickFilterText', (e.target as HTMLInputElement).value),
  );

  q(root, '.add').addEventListener('click', () => {
    const owner = store.person(q<HTMLSelectElement>(root, '.owner').value)!;
    const persona: Persona = {
      persona: 'new persona',
      connection_goal: '',
      motivation: '',
      contributions: [],
      expectations: [],
      important_interests_and_values: [],
      communication_style: '',
      boundaries: [],
      initial_disclosure: '',
    };
    owner.personas.personas.push(persona);
    store.touch(owner.personas);
    api.applyTransaction({ add: [{ owner, persona }] });
  });

  q(root, '.delete').addEventListener('click', () => {
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
