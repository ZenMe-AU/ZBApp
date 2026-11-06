import Graph from 'graphology';
import Sigma from 'sigma';
import { createGrid, type GridApi } from 'ag-grid-community';
import { store } from '../data/store';
import type { PreferenceKind } from '../data/types';
import { heat, kindColor } from '../shared/colors';
import { esc, q } from '../shared/dom';
import { cosine, keywordVectors, modelSummary, pca2 } from '../shared/vectors';

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="toolbar">
      <h2 title="Keywords placed by the first two principal components of their embeddings (a linear 2D projection). Nearby points are usually similar, but distances are only approximate. Lines join pairs above the cut-off; click a keyword to list its nearest neighbours.">Keyword map ⓘ</h2>
      <span class="hint model"></span>
      <label>Link pairs ≥ <input class="cut" type="range" min="0" max="1" step="0.01" value="0.55" /> <b class="cut-val"></b></label>
      <span class="legend">${Object.entries(kindColor).map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`).join('')}<span><i style="background:#777"></i>mixed</span></span>
    </div>
    <div class="split"><div class="graph"></div><aside class="panel"><p class="empty">Click a keyword.</p></aside></div>`;

  q(root, '.model').textContent = modelSummary(store.people);
  const panel = q(root, '.panel');
  const vecs = keywordVectors(store.people);
  const coords = pca2(vecs.map((v) => v.vec));
  const graph = new Graph({ type: 'undirected' });
  vecs.forEach((v, i) =>
    graph.addNode(v.key, {
      label: v.text,
      x: coords[i][0],
      y: coords[i][1],
      size: 3 + v.owners.size * 2,
      color: v.kinds.size === 1 ? kindColor[[...v.kinds][0] as PreferenceKind] : '#777',
    }),
  );
  const sims = vecs.map((a) => vecs.map((b) => cosine(a.vec, b.vec)));

  const syncEdges = () => {
    const cut = Number(q<HTMLInputElement>(root, '.cut').value);
    q(root, '.cut-val').textContent = cut.toFixed(2);
    graph.clearEdges();
    for (let i = 0; i < vecs.length; i++) {
      for (let j = i + 1; j < vecs.length; j++) {
        if (sims[i][j] >= cut) graph.addEdge(vecs[i].key, vecs[j].key, { size: 1 + (sims[i][j] - cut) * 8, color: '#ccd3da' });
      }
    }
  };
  syncEdges();

  let selected: string | undefined;
  const renderer = new Sigma(graph, q(root, '.graph'), {
    labelRenderedSizeThreshold: 4,
    nodeReducer: (node, data) =>
      selected && node !== selected && !graph.areNeighbors(node, selected) ? { ...data, color: '#e6eaee', label: '' } : data,
    edgeReducer: (edge, data) => (selected && !graph.hasExtremity(edge, selected) ? { ...data, hidden: true } : data),
  });

  let grid: GridApi | undefined;
  renderer.on('clickNode', ({ node }) => {
    selected = node;
    renderer.refresh();
    grid?.destroy();
    const i = vecs.findIndex((v) => v.key === node);
    const rows = vecs
      .map((v, j) => ({ keyword: v.text, sim: sims[i][j], kinds: [...v.kinds].join(', '), owners: [...v.owners].join(', ') }))
      .filter((_, j) => j !== i)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 15);
    panel.innerHTML = `<h3>${esc(vecs[i].text)}</h3><p class="hint">${esc([...vecs[i].kinds].join(', '))} · ${esc([...vecs[i].owners].join(', '))}</p><div class="g"></div>`;
    grid = createGrid(q(panel, '.g'), {
      rowData: rows,
      domLayout: 'autoHeight',
      defaultColDef: { flex: 1, wrapText: true, autoHeight: true },
      columnDefs: [
        { field: 'keyword', flex: 2 },
        { field: 'sim', headerName: 'Cosine', maxWidth: 90, valueFormatter: (p) => p.value.toFixed(3), cellStyle: (p) => heat(p.value) },
        { field: 'kinds' },
        { field: 'owners', headerName: 'Identities', flex: 2 },
      ],
    });
  });
  renderer.on('clickStage', () => {
    selected = undefined;
    renderer.refresh();
  });
  q(root, '.cut').addEventListener('input', syncEdges);

  return () => {
    grid?.destroy();
    renderer.kill();
  };
}
