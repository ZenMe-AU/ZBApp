import { VennDiagram, type ISetOverlap, type IStyledSetOverlap } from '@upsetjs/venn.js';
import { select } from 'd3-selection';
import { createGrid, type GridApi } from 'ag-grid-community';
import { store } from '../data/store';
import { personColor } from '../shared/colors';
import { esc, q } from '../shared/dom';
import { membership, sourceOptions, type Membership, type SetSource } from '../shared/sets';

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <h2>Venn diagram (area-proportional)</h2>
    <p class="hint">Euler layout via venn.js: circle and overlap areas approximate set sizes. Pick 2–4 identities; click a region to list its exclusive items.</p>
    <div class="toolbar">
      <select class="source">${sourceOptions('positive')}</select>
      ${store.people
        .map((p, i) => `<label><input type="checkbox" class="who" value="${esc(p.id)}" ${i < 3 ? 'checked' : ''} /> ${esc(p.identity.name)}</label>`)
        .join('')}
    </div>
    <div class="split"><div class="chart venn-wrap"></div><aside class="panel"><h3 class="region">All items</h3><div class="g"></div></aside></div>`;

  const chartEl = q(root, '.chart');
  let region: string[] | undefined;
  let names: string[] = [];
  let grid: GridApi<Membership> | undefined;

  const draw = () => {
    const source = q<HTMLSelectElement>(root, '.source').value as SetSource;
    const ids = [...root.querySelectorAll<HTMLInputElement>('.who:checked')].map((c) => c.value).slice(0, 4);
    const chosen = store.people.filter((p) => ids.includes(p.id));
    const items = membership(chosen, source);
    names = chosen.map((p) => p.identity.name).filter((n) => items.some((m) => m.sets.includes(n)));
    region = undefined;

    const areas: (IStyledSetOverlap & { label?: string })[] = [];
    for (let mask = 1; mask < 1 << names.length; mask++) {
      const sets = names.filter((_, i) => mask & (1 << i));
      const size = items.filter((m) => sets.every((s) => m.sets.includes(s))).length;
      areas.push(sets.length === 1 ? { sets, size, label: `${sets[0]} (${size})` } : { sets, size });
    }

    chartEl.innerHTML = '';
    if (names.length < 2) {
      chartEl.textContent = 'Select at least two identities with items in this source.';
    } else {
      // venn.js passes the area's sets array here, not a string key.
      const colors = (key: unknown) => personColor(store.people.findIndex((p) => p.identity.name === String(key)));
      select(chartEl).datum<readonly IStyledSetOverlap[]>(areas).call(VennDiagram().width(620).height(440).colors(colors));
      select(chartEl)
        .selectAll<SVGGElement, ISetOverlap>('g.venn-area')
        .on('click', function (_e, d) {
          region = [...d.sets];
          select(chartEl).selectAll('g.venn-area').classed('selected', false);
          select(this).classed('selected', true);
          q(root, '.region').textContent = `Only in: ${region.join(' ∩ ')}`;
          grid?.onFilterChanged();
        });
    }

    grid?.destroy();
    q(root, '.region').textContent = 'All items';
    grid = createGrid<Membership>(q(root, '.g'), {
      rowData: items,
      domLayout: 'autoHeight',
      columnDefs: [
        { field: 'name', headerName: 'Item', flex: 2, filter: true },
        ...names.map((n) => ({ headerName: n, flex: 1, valueGetter: (p: { data?: Membership }) => (p.data!.sets.includes(n) ? '✓' : '') })),
      ],
      isExternalFilterPresent: () => !!region,
      doesExternalFilterPass: (node) =>
        names.every((n) => node.data!.sets.includes(n) === region!.includes(n)),
    });
  };

  root.querySelectorAll('.toolbar select, .toolbar input').forEach((el) => el.addEventListener('change', draw));
  draw();

  return () => grid?.destroy();
}
