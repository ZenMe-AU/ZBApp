import { createGrid } from 'ag-grid-community';
import { store } from '../data/store';
import { preferenceKinds, type Person, type Preference, type PropertiesPersona } from '../data/types';
import { heat, kindColor } from '../shared/colors';
import { esc, personOptions, q } from '../shared/dom';

interface Row {
  owner: Person;
  group: PropertiesPersona;
  pref: Preference;
}

function sparkline(values: number[]): HTMLElement {
  const el = document.createElement('div');
  el.className = 'spark';
  for (const v of values) {
    const bar = document.createElement('span');
    bar.style.height = `${Math.max(2, Math.abs(v) * 100)}%`;
    bar.style.background = v >= 0 ? '#4e79a7' : '#e15759';
    el.append(bar);
  }
  return el;
}

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <h2>Preferences</h2>
    <p class="hint">One row per preference in <code>*-properties.json</code>. Edit keyword, kind and affinity; embeddings are shown as sparklines (edit them in the Embeddings heatmap).</p>
    <div class="toolbar">
      <input class="search" placeholder="Quick filter…" />
      <select class="owner">${personOptions()}</select>
      <select class="persona"></select>
      <input class="keyword" placeholder="New keyword" />
      <button class="add">Add preference</button>
      <button class="delete danger">Delete selected</button>
    </div>
    <div class="fill"></div>`;

  const ownerSelect = q<HTMLSelectElement>(root, '.owner');
  const personaSelect = q<HTMLSelectElement>(root, '.persona');
  const fillPersonas = () => {
    const owner = store.person(ownerSelect.value)!;
    const names = new Set([...owner.personas.personas.map((p) => p.persona), ...owner.properties.personas.map((g) => g.persona)]);
    personaSelect.innerHTML = [...names].map((n) => `<option>${esc(n)}</option>`).join('');
  };
  ownerSelect.addEventListener('change', fillPersonas);
  fillPersonas();

  const rows: Row[] = store.people.flatMap((owner) =>
    owner.properties.personas.flatMap((group) => group.preferences.map((pref) => ({ owner, group, pref }))),
  );

  const api = createGrid<Row>(q(root, '.fill'), {
    rowData: rows,
    rowSelection: { mode: 'multiRow' },
    defaultColDef: { filter: true, flex: 1, minWidth: 110 },
    columnDefs: [
      { headerName: 'Identity', valueGetter: (p) => p.data!.owner.identity.name },
      { headerName: 'Persona', field: 'group.persona', minWidth: 180 },
      { headerName: 'Keyword', field: 'pref.keyword', editable: true, flex: 2, minWidth: 220 },
      {
        headerName: 'Kind',
        field: 'pref.kind',
        editable: true,
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: { values: preferenceKinds },
        cellStyle: (p) => ({ color: kindColor[p.value as keyof typeof kindColor], fontWeight: 600 }),
        maxWidth: 120,
      },
      {
        headerName: 'Affinity',
        field: 'pref.affinity',
        editable: true,
        cellDataType: 'number',
        cellEditorParams: { min: -1, max: 1, step: 0.1 },
        cellStyle: (p) => heat(p.value),
        maxWidth: 110,
      },
      { headerName: 'Embedding', cellRenderer: (p: { data: Row }) => sparkline(p.data.pref.embedding), filter: false, minWidth: 120 },
    ],
    onCellValueChanged: (e) => store.touch(e.data.owner.properties),
  });

  q<HTMLInputElement>(root, '.search').addEventListener('input', (e) =>
    api.setGridOption('quickFilterText', (e.target as HTMLInputElement).value),
  );

  q(root, '.add').addEventListener('click', () => {
    const owner = store.person(ownerSelect.value)!;
    const keyword = q<HTMLInputElement>(root, '.keyword').value.trim();
    if (!keyword) return;
    let group = owner.properties.personas.find((g) => g.persona === personaSelect.value);
    if (!group) {
      group = { persona: personaSelect.value, preferences: [] };
      owner.properties.personas.push(group);
    }
    const pref = store.newPreference(owner, keyword, 'interest', 0.5);
    group.preferences.push(pref);
    store.touch(owner.properties);
    api.applyTransaction({ add: [{ owner, group, pref }] });
  });

  q(root, '.delete').addEventListener('click', () => {
    const selected = api.getSelectedRows();
    if (!selected.length || !confirm(`Delete ${selected.length} preference(s)?`)) return;
    for (const row of selected) {
      row.group.preferences.splice(row.group.preferences.indexOf(row.pref), 1);
      store.touch(row.owner.properties);
    }
    api.applyTransaction({ remove: selected });
  });

  return () => api.destroy();
}
