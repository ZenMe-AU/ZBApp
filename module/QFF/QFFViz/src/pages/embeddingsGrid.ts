import { createGrid, type ColDef } from 'ag-grid-community';
import { store } from '../data/store';
import type { Person } from '../data/types';
import { heat } from '../shared/colors';
import { q } from '../shared/dom';

interface Row {
  owner: Person;
  persona: string;
  label: string;
  kind: string;
  vec: number[];
}

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <h2>Embeddings heatmap</h2>
    <p class="hint">Every embedding vector in <code>*-properties.json</code>, including <code>kind_vectors</code>. Cells are editable numbers.</p>
    <div class="toolbar"><input class="search" placeholder="Quick filter…" /></div>
    <div class="fill"></div>`;

  const rows: Row[] = store.people.flatMap((owner) => [
    ...owner.properties.personas.flatMap((g) =>
      g.preferences.map((p) => ({ owner, persona: g.persona, label: p.keyword, kind: p.kind, vec: p.embedding ?? [] })),
    ),
    ...Object.entries(owner.properties.kind_vectors ?? {}).map(([kind, vec]) => ({
      owner,
      persona: '(kind_vectors)',
      label: kind,
      kind,
      vec,
    })),
  ]);

  const dims = Math.max(0, ...rows.map((r) => r.vec.length));
  const dimCols: ColDef<Row>[] = Array.from({ length: dims }, (_, i) => ({
    colId: `d${i}`,
    headerName: String(i),
    width: 70,
    editable: true,
    cellDataType: 'number',
    valueGetter: (p) => p.data!.vec[i],
    valueSetter: (p) => {
      p.data.vec[i] = Number(p.newValue ?? 0);
      return true;
    },
    valueFormatter: (p) => (typeof p.value === 'number' ? p.value.toFixed(3) : ''),
    cellStyle: (p) => heat(p.value),
  }));

  const api = createGrid<Row>(q(root, '.fill'), {
    rowData: rows,
    defaultColDef: { resizable: true, sortable: true },
    columnDefs: [
      { headerName: 'Identity', valueGetter: (p) => p.data!.owner.identity.name, pinned: 'left', width: 140, filter: true },
      { field: 'persona', pinned: 'left', width: 170, filter: true },
      { field: 'label', headerName: 'Keyword', pinned: 'left', width: 220, filter: true },
      { field: 'kind', width: 90, filter: true },
      ...dimCols,
    ],
    onCellValueChanged: (e) => store.touch(e.data.owner.properties),
  });

  q<HTMLInputElement>(root, '.search').addEventListener('input', (e) =>
    api.setGridOption('quickFilterText', (e.target as HTMLInputElement).value),
  );

  return () => api.destroy();
}
