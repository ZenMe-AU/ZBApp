import { createGrid } from 'ag-grid-community';
import { store } from '../data/store';
import { heat } from '../shared/colors';
import { esc, q } from '../shared/dom';
import { cosine, keywordVectors, modelSummary } from '../shared/vectors';

interface Pair {
  a: string;
  b: string;
  sim: number;
  sameKind: boolean;
  kinds: string;
  owners: string;
}

const bins = 50;

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="toolbar">
      <h2 title="Cosine similarity of every unique keyword pair. Green bars are pairs sharing a kind, grey bars mix kinds. Use it to see where related concepts separate from unrelated ones before choosing a concept cut-off.">Similarity distribution ⓘ</h2>
      <span class="hint model"></span>
      <label>Concept cut-off <input class="cut" type="range" min="0" max="1" step="0.01" value="0.55" /> <b class="cut-val"></b></label>
      <label>Table window ± <input class="win" type="number" min="0" max="1" step="0.01" value="0.05" style="width:60px" /></label>
    </div>
    <svg class="hist" height="220" style="width:100%;flex:none;background:#fbfcfd;border:1px solid #d9dee3;border-radius:4px"></svg>
    <p class="hint summary"></p>
    <div class="fill"></div>`;

  q(root, '.model').textContent = modelSummary(store.people);
  const vecs = keywordVectors(store.people);
  const pairs: Pair[] = [];
  for (let i = 0; i < vecs.length; i++) {
    for (let j = i + 1; j < vecs.length; j++) {
      const a = vecs[i], b = vecs[j];
      pairs.push({
        a: a.text,
        b: b.text,
        sim: cosine(a.vec, b.vec),
        sameKind: [...a.kinds].some((k) => b.kinds.has(k)),
        kinds: `${[...a.kinds].join('/')} · ${[...b.kinds].join('/')}`,
        owners: `${[...a.owners].join(', ')} · ${[...b.owners].join(', ')}`,
      });
    }
  }
  const min = Math.min(...pairs.map((p) => p.sim));
  const max = Math.max(...pairs.map((p) => p.sim));
  const bin = (v: number) => Math.min(bins - 1, Math.floor(((v - min) / (max - min || 1)) * bins));
  const same = new Array<number>(bins).fill(0);
  const mixed = new Array<number>(bins).fill(0);
  pairs.forEach((p) => (p.sameKind ? same : mixed)[bin(p.sim)]++);

  const grid = createGrid<Pair>(q(root, '.fill'), {
    rowData: [],
    defaultColDef: { flex: 1, sortable: true, filter: true },
    columnDefs: [
      { field: 'a', headerName: 'Keyword A', flex: 2 },
      { field: 'b', headerName: 'Keyword B', flex: 2 },
      { field: 'sim', headerName: 'Cosine', sort: 'desc', maxWidth: 110, valueFormatter: (p) => p.value.toFixed(3), cellStyle: (p) => heat(p.value) },
      { field: 'kinds', flex: 2 },
      { field: 'owners', headerName: 'Identities', flex: 3 },
    ],
  });

  const draw = () => {
    const cut = Number(q<HTMLInputElement>(root, '.cut').value);
    const win = Number(q<HTMLInputElement>(root, '.win').value);
    q(root, '.cut-val').textContent = cut.toFixed(2);
    const svg = q<SVGSVGElement>(root, '.hist');
    const w = svg.clientWidth || 800;
    const h = 220, pad = 24;
    const top = Math.max(...same.map((s, i) => s + mixed[i]), 1);
    const bw = (w - pad * 2) / bins;
    const y = (v: number) => ((h - pad * 2) * v) / top;
    const x = (v: number) => pad + ((v - min) / (max - min || 1)) * (w - pad * 2);
    svg.innerHTML =
      same
        .map((s, i) => {
          const tip = `${(min + (i / bins) * (max - min)).toFixed(2)}–${(min + ((i + 1) / bins) * (max - min)).toFixed(2)}: ${s} same-kind, ${mixed[i]} mixed`;
          return `<g><title>${esc(tip)}</title>
            <rect x="${pad + i * bw}" y="${h - pad - y(s + mixed[i])}" width="${bw - 1}" height="${y(mixed[i])}" fill="#b8c1cb"/>
            <rect x="${pad + i * bw}" y="${h - pad - y(s)}" width="${bw - 1}" height="${y(s)}" fill="#59a14f"/></g>`;
        })
        .join('') +
      `<line x1="${x(cut)}" x2="${x(cut)}" y1="${pad / 2}" y2="${h - pad}" stroke="#d62728" stroke-width="2"/>
       <text x="${pad}" y="${h - 6}" font-size="11">${min.toFixed(2)}</text>
       <text x="${w - pad}" y="${h - 6}" font-size="11" text-anchor="end">${max.toFixed(2)}</text>
       <text x="${x(cut) + 4}" y="${pad}" font-size="11" fill="#d62728">cut-off ${cut.toFixed(2)}</text>`;
    const above = pairs.filter((p) => p.sim >= cut);
    q(root, '.summary').textContent = `${vecs.length} unique keywords, ${pairs.length} pairs. ${above.length} pairs (${((above.length / pairs.length) * 100).toFixed(1)}%) pass the cut-off, ${above.filter((p) => p.sameKind).length} of them share a kind. Table shows pairs within ±${win} of the cut-off.`;
    grid.setGridOption('rowData', pairs.filter((p) => Math.abs(p.sim - cut) <= win));
  };

  root.querySelectorAll('input').forEach((i) => i.addEventListener('input', draw));
  draw();

  return () => grid.destroy();
}
