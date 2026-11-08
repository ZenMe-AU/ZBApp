import { createGrid, type GridApi } from 'ag-grid-community';
import { store } from '../data/store';
import { preferenceKinds, type Person, type Persona, type Preference, type Relation } from '../data/types';
import { heat, personColor } from '../shared/colors';
import { esc, q } from '../shared/dom';
import { kvGrid, listCol, longText, splitLines } from '../shared/grid';

const personaFields: (keyof Persona)[] = [
  'persona',
  'connection_goal',
  'motivation',
  'contributions',
  'expectations',
  'important_interests_and_values',
  'communication_style',
  'boundaries',
  'initial_disclosure',
];

function personasTransposed(el: HTMLElement, owner: Person): GridApi {
  const personas = owner.personas.personas;
  return createGrid<{ field: keyof Persona }>(el, {
    rowData: personaFields.map((field) => ({ field })),
    domLayout: 'autoHeight',
    columnDefs: [
      { field: 'field', pinned: 'left', width: 200, cellClass: 'kv-key' },
      ...personas.map((persona, i) => ({
        ...longText,
        colId: `p${i}`,
        headerName: persona.persona,
        flex: 1,
        editable: true,
        valueGetter: (p: { data?: { field: keyof Persona } }) => {
          const v = persona[p.data!.field];
          return Array.isArray(v) ? v.join('\n') : v;
        },
        valueSetter: (p: { data: { field: keyof Persona }; newValue: unknown }) => {
          const field = p.data.field;
          const rec = persona as unknown as Record<string, unknown>;
          if (Array.isArray(persona[field])) {
            rec[field] = splitLines(p.newValue);
            return true;
          }
          if (field === 'persona') {
            const props = owner.properties.personas.find((g) => g.persona === persona.persona);
            if (props) props.persona = String(p.newValue);
            store.touch(owner.properties);
          }
          rec[field] = String(p.newValue ?? '');
          return true;
        },
      })),
    ],
    onCellValueChanged: () => store.touch(owner.personas),
  });
}

function preferencesGrid(el: HTMLElement, owner: Person): GridApi {
  const rows = owner.properties.personas.flatMap((g) => g.preferences.map((pref) => ({ persona: g.persona, pref })));
  return createGrid<{ persona: string; pref: Preference }>(el, {
    rowData: rows,
    domLayout: 'autoHeight',
    defaultColDef: { flex: 1, filter: true },
    columnDefs: [
      { field: 'persona' },
      { field: 'pref.keyword', headerName: 'Keyword', editable: true, flex: 2 },
      { field: 'pref.kind', headerName: 'Kind', editable: true, cellEditor: 'agSelectCellEditor', cellEditorParams: { values: preferenceKinds } },
      { field: 'pref.affinity', headerName: 'Affinity', editable: true, cellDataType: 'number', cellStyle: (p) => heat(p.value) },
    ],
    onCellValueChanged: (e) => {
      // The stored vector belongs to the old wording.
      if (e.colDef.field === 'pref.keyword') e.data.pref.embedding = null;
      store.touch(owner.properties);
    },
  });
}

function relationsGrid(el: HTMLElement, owner: Person): GridApi {
  return createGrid<Relation>(el, {
    rowData: owner.relations.relations,
    domLayout: 'autoHeight',
    defaultColDef: { flex: 1, editable: true },
    columnDefs: [
      {
        field: 'contact_ref',
        headerName: 'Contact',
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: { values: store.people.filter((p) => p !== owner).map((p) => p.id) },
        valueFormatter: (p) => store.nameOf(p.value),
      },
      listCol('topics_shared', 'Topics shared'),
      listCol('topics_private', 'Topics private'),
      { field: 'source' },
    ],
    onCellValueChanged: () => store.touch(owner.relations),
  });
}

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <h2>Profile editor</h2>
    <p class="hint">All four files of one identity on a single page. Personas are transposed: one column per persona.</p>
    <div class="cards">${store.people
      .map((p, i) => `<button data-id="${esc(p.id)}" style="border-left:4px solid ${personColor(i)}">${esc(p.identity.name)}</button>`)
      .join('')}</div>
    <div class="fill scroll"></div>`;

  const body = q(root, '.fill');
  let apis: GridApi[] = [];

  const show = (owner: Person) => {
    apis.forEach((a) => a.destroy());
    body.innerHTML = `
      <h3>${esc(owner.identity.name)} <small class="hint">${esc(owner.folder)}</small></h3>
      <h3>Identity</h3><div class="g-identity"></div>
      <h3>Personas</h3><div class="g-personas"></div>
      <h3>Preferences</h3><div class="g-prefs"></div>
      <h3>Relations</h3><div class="g-rels"></div>`;
    apis = [
      kvGrid(q(body, '.g-identity'), owner.identity, () => store.touch(owner.identity), ['identity_id']),
      personasTransposed(q(body, '.g-personas'), owner),
      preferencesGrid(q(body, '.g-prefs'), owner),
      relationsGrid(q(body, '.g-rels'), owner),
    ];
  };

  root.querySelectorAll<HTMLButtonElement>('.cards button').forEach((b) =>
    b.addEventListener('click', () => show(store.person(b.dataset.id!)!)),
  );
  if (store.people[0]) show(store.people[0]);

  return () => apis.forEach((a) => a.destroy());
}
