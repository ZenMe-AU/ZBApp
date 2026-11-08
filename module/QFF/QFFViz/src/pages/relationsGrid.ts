import { createGrid } from 'ag-grid-community';
import { store } from '../data/store';
import type { Person, Relation } from '../data/types';
import { listCol } from '../shared/grid';
import { personOptions, q } from '../shared/dom';

interface Row {
  owner: Person;
  rel: Relation;
}

const isReciprocal = (row: Row) =>
  store.person(row.rel.contact_ref)?.relations.relations.some((r) => r.contact_ref === row.owner.id) ?? false;

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <h2>Relations</h2>
    <p class="hint">One row per entry in <code>*-relations.json</code>. Topics hold one item per line.</p>
    <div class="toolbar">
      <input class="search" placeholder="Quick filter…" />
      <label>From <select class="owner">${personOptions()}</select></label>
      <label>To <select class="contact">${personOptions()}</select></label>
      <button class="add">Add relation</button>
      <button class="delete danger">Delete selected</button>
    </div>
    <div class="fill"></div>`;

  const rows: Row[] = store.people.flatMap((owner) => owner.relations.relations.map((rel) => ({ owner, rel })));

  const api = createGrid<Row>(q(root, '.fill'), {
    rowData: rows,
    rowSelection: { mode: 'multiRow' },
    defaultColDef: { filter: true, flex: 1, minWidth: 140 },
    columnDefs: [
      { headerName: 'From', valueGetter: (p) => p.data!.owner.identity.name },
      {
        headerName: 'To',
        field: 'rel.contact_ref',
        editable: true,
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: { values: store.people.map((p) => p.id) },
        valueFormatter: (p) => store.nameOf(p.value),
      },
      { headerName: 'Reciprocal', valueGetter: (p) => (isReciprocal(p.data!) ? 'yes' : 'no'), maxWidth: 110 },
      listCol('rel.topics_shared', 'Topics shared'),
      listCol('rel.topics_private', 'Topics private'),
      { headerName: 'Source', field: 'rel.source', editable: true, maxWidth: 140 },
    ],
    onCellValueChanged: (e) => {
      store.touch(e.data.owner.relations);
      api.refreshCells({ force: true });
    },
  });

  q<HTMLInputElement>(root, '.search').addEventListener('input', (e) =>
    api.setGridOption('quickFilterText', (e.target as HTMLInputElement).value),
  );

  q(root, '.add').addEventListener('click', () => {
    const owner = store.person(q<HTMLSelectElement>(root, '.owner').value)!;
    const contact = q<HTMLSelectElement>(root, '.contact').value;
    if (contact === owner.id) return alert('A relation needs two different identities.');
    const rel: Relation = { contact_ref: contact, topics_shared: [], topics_private: [], source: 'manual' };
    owner.relations.relations.push(rel);
    store.touch(owner.relations);
    api.applyTransaction({ add: [{ owner, rel }] });
    api.refreshCells({ force: true });
  });

  q(root, '.delete').addEventListener('click', () => {
    const selected = api.getSelectedRows();
    if (!selected.length || !confirm(`Delete ${selected.length} relation(s)?`)) return;
    for (const row of selected) {
      row.owner.relations.relations.splice(row.owner.relations.relations.indexOf(row.rel), 1);
      store.touch(row.owner.relations);
    }
    api.applyTransaction({ remove: selected });
    api.refreshCells({ force: true });
  });

  return () => api.destroy();
}
