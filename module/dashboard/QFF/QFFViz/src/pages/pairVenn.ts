import { extractSets, renderVennDiagram, type ISetLike } from '@upsetjs/bundle';
import { createGrid, type GridApi } from 'ag-grid-community';
import { store } from '../data/store';
import type { Person, Relation } from '../data/types';
import { esc, personOptions, q } from '../shared/dom';
import { kvGrid } from '../shared/grid';
import { itemsFor, normalize, type Membership } from '../shared/sets';

const relationOf = (from: Person, to: Person) => from.relations.relations.find((r) => r.contact_ref === to.id);

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <h2>Relationship pair</h2>
    <p class="hint">Do the topics declared as shared in the relation(s) actually appear in both people's positive preferences? Edit the relations on the right and the diagram updates.</p>
    <div class="toolbar">
      <select class="a">${personOptions(store.people[0]?.id)}</select> ↔
      <select class="b">${personOptions(store.people[1]?.id)}</select>
    </div>
    <div class="split">
      <div class="scroll"><div class="chart"></div><h3 class="region">Click a region</h3><div class="items"></div></div>
      <aside class="panel"></aside>
    </div>`;

  const chartEl = q(root, '.chart');
  const panel = q(root, '.panel');
  const itemsGrid = createGrid<Membership>(q(root, '.items'), {
    rowData: [],
    domLayout: 'autoHeight',
    columnDefs: [
      { field: 'name', headerName: 'Item', flex: 2 },
      { headerName: 'Sets', flex: 3, valueGetter: (p) => p.data!.sets.join(', ') },
    ],
  });
  let relGrids: GridApi[] = [];

  const drawVenn = (a: Person, b: Person) => {
    const declared = `Declared shared (${a.id} ↔ ${b.id})`;
    const lists: [string, string[]][] = [
      [`${a.identity.name} preferences`, itemsFor(a, 'positive')],
      [`${b.identity.name} preferences`, itemsFor(b, 'positive')],
      [declared, [...new Set([relationOf(a, b), relationOf(b, a)].flatMap((r) => r?.topics_shared ?? []).map(normalize))]],
    ];
    const map = new Map<string, string[]>();
    for (const [set, items] of lists) items.forEach((i) => map.set(i, [...(map.get(i) ?? []), set]));
    const sets = extractSets([...map].map(([name, s]) => ({ name, sets: s })));
    let selection: ISetLike<Membership> | null = null;
    itemsGrid.setGridOption('rowData', []);
    q(root, '.region').textContent = 'Click a region';

    const paint = () =>
      renderVennDiagram<Membership>(chartEl, {
        sets,
        width: 600,
        height: 420,
        selection,
        onClick: (s) => {
          selection = s;
          q(root, '.region').textContent = s ? `${s.name} (${s.cardinality})` : 'Click a region';
          itemsGrid.setGridOption('rowData', s ? [...s.elems] : []);
          paint();
        },
      });
    paint();
  };

  const draw = () => {
    const a = store.person(q<HTMLSelectElement>(root, '.a').value)!;
    const b = store.person(q<HTMLSelectElement>(root, '.b').value)!;
    relGrids.forEach((g) => g.destroy());
    relGrids = [];
    if (a === b) {
      panel.innerHTML = '<p class="empty">Pick two different identities.</p>';
      chartEl.innerHTML = '';
      return;
    }
    drawVenn(a, b);

    panel.innerHTML = [
      [a, b],
      [b, a],
    ]
      .map(([from, to], i) => `<h3>${esc(from.identity.name)} → ${esc(to.identity.name)}</h3><div class="rel${i}"></div>`)
      .join('');
    ([[a, b], [b, a]] as const).forEach(([from, to], i) => {
      const host = q(panel, `.rel${i}`);
      const rel = relationOf(from, to);
      if (rel) {
        relGrids.push(kvGrid(host, rel, () => { store.touch(from.relations); drawVenn(a, b); }, ['contact_ref']));
        return;
      }
      host.innerHTML = '<button>Create relation</button>';
      host.querySelector('button')!.addEventListener('click', () => {
        const created: Relation = { contact_ref: to.id, topics_shared: [], topics_private: [], source: 'manual' };
        from.relations.relations.push(created);
        store.touch(from.relations);
        draw();
      });
    });
  };

  q(root, '.a').addEventListener('change', draw);
  q(root, '.b').addEventListener('change', draw);
  draw();

  return () => {
    relGrids.forEach((g) => g.destroy());
    itemsGrid.destroy();
  };
}
