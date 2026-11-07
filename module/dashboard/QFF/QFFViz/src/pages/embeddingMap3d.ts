import Plotly, { type Data, type PlotlyHTMLElement } from 'plotly.js-dist-min';
import { UMAP } from 'umap-js';
import { createGrid, type GridApi } from 'ag-grid-community';
import { store } from '../data/store';
import type { PreferenceKind } from '../data/types';
import { heat, kindColor } from '../shared/colors';
import { esc, openInfo, q } from '../shared/dom';
import { normalize } from '../shared/sets';
import { cosine, kmeans, modelSummary, pca, seededRandom } from '../shared/vectors';

interface Use {
  person: string;
  persona: string;
  kind: PreferenceKind;
  affinity: number;
}

interface Point {
  key: string;
  text: string;
  vec: number[];
  uses: Use[];
}

type ColourMode = 'kind' | 'identity' | 'persona' | 'affinity' | 'cluster' | 'similarity';

const colourModes: Record<ColourMode, string> = {
  kind: 'Kind',
  identity: 'Identity',
  persona: 'Persona',
  affinity: 'Mean affinity',
  cluster: 'Cluster (k-means)',
  similarity: 'Similarity to selected',
};

const palette = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
];

const unique = <T,>(xs: T[]) => [...new Set(xs)];
const meanAffinity = (p: Point) => p.uses.reduce((s, u) => s + u.affinity, 0) / p.uses.length;

function buildPoints(): Point[] {
  const map = new Map<string, Point>();
  for (const person of store.people) {
    for (const g of person.properties.personas) {
      for (const pref of g.preferences) {
        if (!pref.embedding?.length) continue;
        const key = normalize(pref.keyword);
        const point = map.get(key) ?? { key, text: pref.keyword, vec: pref.embedding, uses: [] };
        point.uses.push({ person: person.identity.name, persona: g.persona, kind: pref.kind, affinity: pref.affinity });
        map.set(key, point);
      }
    }
  }
  return [...map.values()];
}

function hoverText(p: Point): string {
  const uses = p.uses.map((u) => `${esc(u.person)} · ${esc(u.persona)} · ${u.kind} ${u.affinity}`).join('<br>');
  return `<b>${esc(p.text)}</b><br>${uses}`;
}

const helpHtml = `
  <p>Every unique keyword from all <code>*-properties.json</code> files is a point. Its full embedding is squeezed into 3D so you can look around it.</p>
  <h4>Projection</h4>
  <ul>
    <li><b>PCA</b> keeps true linear geometry, but the three axes only capture part of the variance (shown in the toolbar). Two points can look close without being similar.</li>
    <li><b>UMAP</b> (cosine, fixed seed) keeps neighbourhoods: clusters are meaningful, distances <i>between</i> clusters are not.</li>
  </ul>
  <p>Links, the neighbour list and similarity colours always use the full-dimension cosine, never the 3D position, so they are safe for cut-off tuning.</p>
  <h4>Marks</h4>
  <ul>
    <li><b>Point size</b> = number of identities using the keyword.</li>
    <li><b>Diamonds</b> = kind vectors (interest, value, boundary).</li>
    <li><b>Lines</b> join keyword pairs whose cosine is at or above the <i>Link pairs</i> slider.</li>
  </ul>
  <h4>Colour by</h4>
  <ul>
    <li><b>Kind</b>: interest / value / boundary; keywords used with several kinds get a combined group.</li>
    <li><b>Identity</b>: each person's own keywords; black = shared by 2+ identities.</li>
    <li><b>Persona</b>: person: persona groups; black = used by several personas.</li>
    <li><b>Mean affinity</b>: red (repels) to green (attracts), averaged over all uses.</li>
    <li><b>Cluster</b>: k-means on the full vectors (set k); each cluster is named after its most central keyword. Compare with Kind to see whether topics or kinds dominate.</li>
    <li><b>Similarity to selected</b>: click a keyword first. Grey = below the cut-off, orange → red = above, with a sharp step at the cut-off.</li>
  </ul>
  <h4>Interacting</h4>
  <ul>
    <li>Drag to rotate, scroll to zoom, right-drag to pan; <i>Auto-rotate</i> helps with depth.</li>
    <li>Hover a point to see every identity, persona, kind and affinity that uses it.</li>
    <li>Click a point to ring it, keep only its links and list its 15 nearest neighbours on the right.</li>
    <li>Click legend entries to hide or show groups; drag the divider to resize the side panel.</li>
  </ul>
  <h4>Reading tips</h4>
  <ul>
    <li>Embeddings place a concept near its opposite (e.g. <i>dishonesty</i> near <i>honesty</i>); the affinity sign, not the vector, tells them apart.</li>
    <li>Tight groups of the same colour under <i>Identity</i> suggest a profile that overlaps little with others.</li>
  </ul>`;

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="toolbar">
      <h2>Keyword map 3D <button class="info-btn" title="How to read this page" aria-label="How to read this page">ⓘ</button></h2>
      <label>Projection <select class="proj"><option value="pca">PCA</option><option value="umap">UMAP</option></select></label>
      <label>Colour by <select class="colour">${Object.entries(colourModes).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label class="k-wrap">k <input class="k" type="number" min="2" max="20" value="8" style="width:50px" /></label>
      <label>Link pairs ≥ <input class="cut" type="range" min="0" max="1" step="0.01" value="0.55" /> <b class="cut-val"></b></label>
      <label><input type="checkbox" class="rotate" /> Auto-rotate</label>
      <span class="hint info"></span>
    </div>
    <div class="split resizable">
      <div class="plot" style="height:100%;min-height:0"></div>
      <div class="splitter" title="Drag to resize"></div>
      <aside class="panel"><p class="empty">Click a keyword to see its nearest neighbours and to colour by similarity.</p></aside>
    </div>`;

  q(root, '.info-btn').addEventListener('click', () => openInfo('How to read the 3D keyword map', helpHtml));

  const plotEl = q(root, '.plot') as unknown as PlotlyHTMLElement & HTMLElement;
  const panel = q(root, '.panel');
  const split = q(root, '.split');
  const points = buildPoints();
  const kindVectors = store.people.find((p) => p.properties.kind_vectors)?.properties.kind_vectors ?? {};
  const kindNames = Object.keys(kindVectors);
  const allVecs = [...points.map((p) => p.vec), ...kindNames.map((k) => kindVectors[k])];
  const sims = points.map((a) => points.map((b) => cosine(a.vec, b.vec)));
  const projections = new Map<string, { coords: number[][]; info: string }>();
  let selected: number | undefined;
  let grid: GridApi | undefined;

  const project = (method: string) => {
    if (!projections.has(method)) {
      if (method === 'pca') {
        const { coords, explained } = pca(allVecs, 3);
        const share = explained.map((e) => `${(e * 100).toFixed(1)}%`).join(' + ');
        projections.set(method, { coords, info: `PCA axes explain ${share} = ${(explained.reduce((s, e) => s + e, 0) * 100).toFixed(1)}% of variance` });
      } else {
        const umap = new UMAP({
          nComponents: 3,
          nNeighbors: Math.min(15, allVecs.length - 1),
          minDist: 0.1,
          distanceFn: (a, b) => 1 - cosine(a, b),
          random: seededRandom(42),
        });
        projections.set(method, { coords: umap.fit(allVecs), info: 'UMAP (cosine, 15 neighbours, seed 42): clusters are meaningful, distances between them are not' });
      }
    }
    return projections.get(method)!;
  };

  const pointTrace = (idx: number[], coords: number[][], name: string, marker: Record<string, unknown>): Data =>
    ({
      type: 'scatter3d',
      mode: 'markers',
      name: `${name} (${idx.length})`,
      x: idx.map((i) => coords[i][0]),
      y: idx.map((i) => coords[i][1]),
      z: idx.map((i) => coords[i][2]),
      text: idx.map((i) => hoverText(points[i])),
      customdata: idx,
      hovertemplate: '%{text}<extra></extra>',
      marker: { size: idx.map((i) => 4 + unique(points[i].uses.map((u) => u.person)).length * 2), line: { width: 0 }, ...marker },
    }) as Data;

  const groupTraces = (coords: number[][], groupOf: (p: Point, i: number) => string, colourOf: (group: string, n: number) => string): Data[] => {
    const groups = new Map<string, number[]>();
    points.forEach((p, i) => groups.set(groupOf(p, i), [...(groups.get(groupOf(p, i)) ?? []), i]));
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, idx], n) => pointTrace(idx, coords, group, { color: colourOf(group, n) }));
  };

  const keywordTraces = (mode: ColourMode, coords: number[][], cut: number): Data[] => {
    const all = points.map((_, i) => i);
    switch (mode) {
      case 'kind':
        return groupTraces(
          coords,
          (p) => unique(p.uses.map((u) => u.kind)).sort().join(' + '),
          (g) => kindColor[g as PreferenceKind] ?? '#777',
        );
      case 'identity':
        return groupTraces(
          coords,
          (p) => (unique(p.uses.map((u) => u.person)).length > 1 ? 'Shared by 2+ identities' : p.uses[0].person),
          (g, n) => (g.startsWith('Shared') ? '#222' : palette[n % palette.length]),
        );
      case 'persona':
        return groupTraces(
          coords,
          (p) => {
            const personas = unique(p.uses.map((u) => `${u.person}: ${u.persona}`));
            return personas.length > 1 ? 'Multiple personas' : personas[0];
          },
          (g, n) => (g === 'Multiple personas' ? '#222' : palette[n % palette.length]),
        );
      case 'affinity':
        return [
          pointTrace(all, coords, 'Keywords', {
            color: points.map(meanAffinity),
            colorscale: 'RdYlGn',
            cmin: -1,
            cmax: 1,
            colorbar: { title: { text: 'mean affinity' }, thickness: 12 },
          }),
        ];
      case 'cluster': {
        const k = Number(q<HTMLInputElement>(root, '.k').value) || 8;
        const labels = kmeans(points.map((p) => p.vec), k);
        // Name each cluster after its most central keyword.
        const names = new Map<number, string>();
        unique(labels).forEach((c) => {
          const members = points.map((_, i) => i).filter((i) => labels[i] === c);
          const best = members.reduce((b, i) => (members.reduce((s, j) => s + sims[i][j], 0) > members.reduce((s, j) => s + sims[b][j], 0) ? i : b), members[0]);
          names.set(c, `C${c + 1}: ${points[best].text}`);
        });
        return groupTraces(coords, (_, i) => names.get(labels[i])!, (_, n) => palette[n % palette.length]);
      }
      case 'similarity': {
        if (selected === undefined) return [pointTrace(all, coords, 'Select a keyword', { color: '#b8c1cb' })];
        const values = sims[selected];
        const min = Math.min(...values);
        const pos = Math.min(Math.max((cut - min) / (1 - min || 1), 0), 1);
        return [
          pointTrace(all, coords, `Similarity to "${points[selected].text}"`, {
            color: values,
            cmin: min,
            cmax: 1,
            // Sharp step at the cut-off: grey below, warm colours above.
            colorscale: [[0, '#e6eaee'], [pos, '#b8c1cb'], [pos, '#fdae61'], [1, '#d62728']],
            colorbar: { title: { text: 'cosine' }, thickness: 12 },
          }),
        ];
      }
    }
  };

  const draw = () => {
    const method = q<HTMLSelectElement>(root, '.proj').value;
    const mode = q<HTMLSelectElement>(root, '.colour').value as ColourMode;
    const cut = Number(q<HTMLInputElement>(root, '.cut').value);
    q(root, '.cut-val').textContent = cut.toFixed(2);
    q(root, '.k-wrap').style.display = mode === 'cluster' ? '' : 'none';
    const { coords, info } = project(method);
    q(root, '.info').textContent = `${modelSummary(store.people)} · ${info}`;

    const lx: (number | null)[] = [], ly: (number | null)[] = [], lz: (number | null)[] = [];
    points.forEach((_, i) =>
      points.forEach((_, j) => {
        if (j <= i || sims[i][j] < cut || (selected !== undefined && i !== selected && j !== selected)) return;
        lx.push(coords[i][0], coords[j][0], null);
        ly.push(coords[i][1], coords[j][1], null);
        lz.push(coords[i][2], coords[j][2], null);
      }),
    );
    const anchorIdx = kindNames.map((_, n) => points.length + n);
    const traces: Data[] = [
      { type: 'scatter3d', mode: 'lines', name: `Links ≥ ${cut.toFixed(2)}`, x: lx, y: ly, z: lz, hoverinfo: 'skip', line: { color: '#9fb3c8', width: 2 } } as Data,
      ...keywordTraces(mode, coords, cut),
      {
        type: 'scatter3d',
        mode: 'text+markers',
        name: 'Kind vectors',
        x: anchorIdx.map((i) => coords[i][0]),
        y: anchorIdx.map((i) => coords[i][1]),
        z: anchorIdx.map((i) => coords[i][2]),
        text: kindNames,
        textposition: 'top center',
        hovertemplate: 'kind vector: %{text}<extra></extra>',
        marker: { symbol: 'diamond', size: 9, color: kindNames.map((k) => kindColor[k as PreferenceKind] ?? '#777'), line: { color: '#000', width: 2 } },
      } as Data,
    ];
    if (selected !== undefined) {
      traces.push({
        type: 'scatter3d',
        mode: 'text+markers',
        name: 'Selected',
        x: [coords[selected][0]],
        y: [coords[selected][1]],
        z: [coords[selected][2]],
        text: [points[selected].text],
        textposition: 'top center',
        hoverinfo: 'skip',
        marker: { size: 14, color: 'rgba(0,0,0,0)', line: { color: '#000', width: 3 } },
      } as Data);
    }
    void Plotly.react(
      plotEl,
      traces,
      {
        uirevision: method,
        margin: { l: 0, r: 0, t: 0, b: 0 },
        legend: { itemsizing: 'constant', font: { size: 11 }, x: 0, y: 1, bgcolor: 'rgba(255,255,255,0.75)' },
        scene: { xaxis: { title: { text: '' } }, yaxis: { title: { text: '' } }, zaxis: { title: { text: '' } } },
      },
      { responsive: true, displaylogo: false },
    );
  };

  const select = (i: number) => {
    selected = i;
    grid?.destroy();
    const rows = points
      .map((p, j) => ({ keyword: p.text, sim: sims[i][j], kinds: unique(p.uses.map((u) => u.kind)).join(', '), owners: unique(p.uses.map((u) => u.person)).join(', ') }))
      .filter((_, j) => j !== i)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 15);
    panel.innerHTML = `<h3>${esc(points[i].text)}</h3><p class="hint">${points[i].uses.map((u) => `${esc(u.person)} · ${esc(u.persona)} · ${u.kind} ${u.affinity}`).join('<br>')}</p>
      <p><button class="clear">Clear selection</button></p><div class="g"></div>`;
    q(panel, '.clear').addEventListener('click', () => {
      selected = undefined;
      grid?.destroy();
      grid = undefined;
      panel.innerHTML = '<p class="empty">Click a keyword to see its nearest neighbours and to colour by similarity.</p>';
      draw();
    });
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
    draw();
  };

  draw();
  plotEl.on('plotly_click', (ev) => {
    const index = ev.points[0]?.customdata;
    if (typeof index === 'number') select(index);
  });

  let angle = 0;
  let rotateTimer: number | undefined;
  q<HTMLInputElement>(root, '.rotate').addEventListener('change', (e) => {
    window.clearInterval(rotateTimer);
    if (!(e.target as HTMLInputElement).checked) return;
    rotateTimer = window.setInterval(() => {
      angle += 0.01;
      void Plotly.relayout(plotEl, { 'scene.camera.eye': { x: 1.8 * Math.cos(angle), y: 1.8 * Math.sin(angle), z: 0.8 } });
    }, 50);
  });

  root.querySelectorAll('.toolbar select, .toolbar input:not(.rotate)').forEach((el) => el.addEventListener('input', draw));

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
      Plotly.Plots.resize(plotEl);
    };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', up);
  });

  return () => {
    window.clearInterval(rotateTimer);
    grid?.destroy();
    Plotly.purge(plotEl);
  };
}
