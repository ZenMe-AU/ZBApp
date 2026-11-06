import { createGrid } from 'ag-grid-community';
import { store } from '../data/store';
import type { IdentityFile } from '../data/types';
import { longText } from '../shared/grid';
import { q } from '../shared/dom';

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <h2>Identities</h2>
    <p class="hint">One row per <code>*-identity.json</code>. Double-click a cell to edit. IDs are read-only because every file references them.</p>
    <div class="fill"></div>`;

  const genders = [...new Set(['female', 'male', 'non-binary', 'other', ...store.people.map((p) => p.identity.gender)])];

  const api = createGrid<IdentityFile>(q(root, '.fill'), {
    rowData: store.people.map((p) => p.identity),
    defaultColDef: { editable: true, filter: true, flex: 1, minWidth: 110 },
    columnDefs: [
      { field: 'identity_id', headerName: 'ID', editable: false, pinned: 'left', maxWidth: 80 },
      { field: 'name', pinned: 'left', minWidth: 150 },
      { field: 'age', cellDataType: 'number', maxWidth: 90 },
      { field: 'gender', cellEditor: 'agSelectCellEditor', cellEditorParams: { values: genders }, maxWidth: 120 },
      { field: 'location', minWidth: 180 },
      { field: 'occupation', ...longText },
      { field: 'summary', ...longText, flex: 3, minWidth: 360 },
    ],
    onCellValueChanged: (e) => store.touch(e.data),
  });

  return () => api.destroy();
}
