import { extractSets, generateCombinations, render as renderUpSet, type ISetLike } from '@upsetjs/bundle';
import { createGrid } from 'ag-grid-community';
import { store } from '../data/store';
import { esc, q } from '../shared/dom';
import { membership, sourceOptions, type Membership, type SetSource } from '../shared/sets';

const descriptions: Record<SetSource, string> = {
  positive:
    'Everything a person is drawn to (any kind, affinity > 0). Overlaps are shared attraction — the default first conversation topics a match suggests.',
  interests:
    'Activities and subjects (kind = interest, liked or disliked). Overlaps show hobbies people could build a connection around.',
  values:
    'Internal ways of being a person chooses to act from (kind = value), never how others should be. Overlaps show people guided by similar principles.',
  wants:
    'Things, conditions or qualities in others that matter to a person (kind = want). Overlaps show what people hope to find or have in common.',
  boundaries:
    'Behaviours a person wants to avoid (kind = boundary). Overlaps show shared limits — useful for safety and as shared-aversion topics, ranked below attraction.',
  negative:
    'Everything a person is repelled by (affinity < 0). Overlaps are shared aversion: valid common ground, but only a natural prompt in the right context.',
  relationShared:
    'Topics a person already discusses with a specific contact (relations files). Overlaps show which topics circulate across the network.',
  relationPrivate:
    'Topics a person withholds from a specific contact. Overlaps show sensitive themes many people keep private — never suggest these as topics.',
};

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <h2>UpSet plot (all identities)</h2>
    <p class="hint desc"></p>
    <div class="toolbar"><select class="source">${sourceOptions('positive')}</select></div>
    <div class="split resizable"><div class="chart"></div><div class="splitter" title="Drag to resize"></div><aside class="panel"><h3 class="region">Click a bar</h3><div class="g"></div></aside></div>`;

  const chartEl = q(root, '.chart');
  const split = q(root, '.split');
  let repaint = () => {};
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
    q(root, '.desc').innerHTML = `${esc(descriptions[source])} <i>Each column counts items held by exactly the dotted identities; click a bar to list them.</i>`;
    const sets = extractSets(membership(store.people, source));
    const combinations = generateCombinations(sets, { type: 'distinctIntersection', min: 1 });
    let selection: ISetLike<Membership> | null = null;

    const paint = () =>
      renderUpSet<Membership>(chartEl, {
        sets,
        combinations,
        width: Math.max(640, chartEl.clientWidth - 20),
        height: 460,
        // Pixel width for set labels so full names fit (default ratio clips them).
        widthRatios: [0.18, Math.max(...sets.map((s) => s.name.length), 4) * 10 + 24],
        selection,
        onClick: (s) => {
          selection = s;
          q(root, '.region').textContent = s ? `${s.name} (${s.cardinality})` : 'Click a bar';
          grid.setGridOption('rowData', s ? [...s.elems] : []);
          paint();
        },
      });
    paint();
    repaint = paint;
  };

  const splitter = q(root, '.splitter');
  splitter.addEventListener('pointerdown', (e) => {
    splitter.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const rect = split.getBoundingClientRect();
      const width = Math.min(Math.max(rect.right - ev.clientX, 200), rect.width - 300);
      split.style.gridTemplateColumns = `minmax(0, 1fr) 6px ${width}px`;
    };
    const up = () => {
      splitter.removeEventListener('pointermove', move);
      splitter.removeEventListener('pointerup', up);
      repaint();
    };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', up);
  });

  q(root, '.source').addEventListener('change', draw);
  draw();

  return () => grid.destroy();
}
