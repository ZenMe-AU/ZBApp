import { extractSets, renderVennDiagram, type ISetLike } from '@upsetjs/bundle';
import { createGrid } from 'ag-grid-community';
import { store } from '../data/store';
import { esc, q } from '../shared/dom';
import { membership, sourceOptions, type Membership, type SetSource } from '../shared/sets';

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <h2>Venn diagram (classic)</h2>
    <p class="hint">Fixed-shape Venn via UpSet.js (up to 5 sets) — every region is visible regardless of size. Click a region to list its items.</p>
    <div class="toolbar">
      <select class="source">${sourceOptions('positive')}</select>
      ${store.people
        .map((p, i) => `<label><input type="checkbox" class="who" value="${esc(p.id)}" ${i < 3 ? 'checked' : ''} /> ${esc(p.identity.name)}</label>`)
        .join('')}
    </div>
    <div class="split"><div class="chart"></div><aside class="panel"><h3 class="region">Click a region</h3><div class="g"></div></aside></div>`;

  const chartEl = q(root, '.chart');
  const grid = createGrid<Membership>(q(root, '.g'), {
    rowData: [],
    domLayout: 'autoHeight',
    columnDefs: [
      { field: 'name', headerName: 'Item', flex: 2, filter: true },
      { headerName: 'Identities', flex: 3, valueGetter: (p) => p.data!.sets.join(', '), wrapText: true, autoHeight: true },
    ],
  });

  const draw = () => {
    const source = q<HTMLSelectElement>(root, '.source').value as SetSource;
    const ids = [...root.querySelectorAll<HTMLInputElement>('.who:checked')].map((c) => c.value).slice(0, 5);
    const sets = extractSets(membership(store.people.filter((p) => ids.includes(p.id)), source));
    let selection: ISetLike<Membership> | null = null;

    const paint = () =>
      renderVennDiagram<Membership>(chartEl, {
        sets,
        width: 640,
        height: 460,
        selection,
        onClick: (s) => {
          selection = s;
          q(root, '.region').textContent = s ? `${s.name} (${s.cardinality})` : 'Click a region';
          grid.setGridOption('rowData', s ? [...s.elems] : []);
          paint();
        },
      });
    paint();
  };

  root.querySelectorAll('.toolbar select, .toolbar input').forEach((el) => el.addEventListener('change', draw));
  draw();

  return () => grid.destroy();
}
