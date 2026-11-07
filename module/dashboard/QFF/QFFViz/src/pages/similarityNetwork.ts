import Graph from 'graphology';
import Sigma from 'sigma';
import { circular } from 'graphology-layout';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { createGrid, type GridApi } from 'ag-grid-community';
import { store } from '../data/store';
import type { Person, PropertiesPersona } from '../data/types';
import { heat, personColor } from '../shared/colors';
import { esc, q } from '../shared/dom';
import { kvGrid } from '../shared/grid';
import { cosine } from '../shared/vectors';

interface Node {
  key: string;
  owner: Person;
  group: PropertiesPersona;
  vec: number[];
}

/** Affinity-weighted centroid of the persona's preference embeddings. */
function centroid(group: PropertiesPersona): number[] {
  const out: number[] = [];
  for (const p of group.preferences) p.embedding?.forEach((v, i) => (out[i] = (out[i] ?? 0) + v * p.affinity));
  return out;
}

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <h2>Persona similarity network</h2>
    <p class="hint">Personas linked across identities by cosine similarity of their affinity-weighted embedding centroids (an approximation for exploring the synthetic data, not the matcher). Click an edge for contributing keyword pairs, a node to edit the persona.</p>
    <div class="toolbar"><label>Similarity threshold <input class="thr" type="range" min="0" max="1" step="0.05" value="0.6" /> <span class="thr-val">0.60</span></label></div>
    <div class="split"><div class="graph"></div><aside class="panel"><p class="empty">Click an edge or node.</p></aside></div>`;

  const panel = q(root, '.panel');
  const nodes: Node[] = store.people.flatMap((owner) =>
    owner.properties.personas.map((group, gi) => ({ key: `${owner.id}|${gi}`, owner, group, vec: centroid(group) })),
  );
  const graph = new Graph({ type: 'undirected' });
  nodes.forEach((n) =>
    graph.addNode(n.key, {
      label: `${n.owner.id}: ${n.group.persona}`,
      size: 10,
      color: personColor(store.people.indexOf(n.owner)),
      x: 0,
      y: 0,
    }),
  );

  const syncEdges = () => {
    const thr = Number(q<HTMLInputElement>(root, '.thr').value);
    q(root, '.thr-val').textContent = thr.toFixed(2);
    graph.clearEdges();
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[i].owner === nodes[j].owner) continue;
        const score = cosine(nodes[i].vec, nodes[j].vec);
        if (score < thr) continue;
        graph.addEdge(nodes[i].key, nodes[j].key, { score, weight: score, label: score.toFixed(2), size: 1 + (score - thr) * 10, color: '#9fb3c8' });
      }
    }
  };
  syncEdges();
  circular.assign(graph);
  forceAtlas2.assign(graph, { iterations: 300, settings: { ...forceAtlas2.inferSettings(graph), edgeWeightInfluence: 1 } });

  const renderer = new Sigma(graph, q(root, '.graph'), { enableEdgeEvents: true, renderEdgeLabels: true });

  let grid: GridApi | undefined;
  const byKey = (key: string) => nodes.find((n) => n.key === key)!;

  renderer.on('clickEdge', ({ edge }) => {
    grid?.destroy();
    const a = byKey(graph.source(edge));
    const b = byKey(graph.target(edge));
    const pairs = a.group.preferences.flatMap((pa) =>
      b.group.preferences
        .filter((pb) => Math.sign(pa.affinity) === Math.sign(pb.affinity))
        .map((pb) => ({ a: pa.keyword, b: pb.keyword, score: pa.affinity * pb.affinity * cosine(pa.embedding, pb.embedding) })),
    );
    pairs.sort((x, y) => y.score - x.score);
    panel.innerHTML = `<h3>${esc(a.owner.identity.name)}: ${esc(a.group.persona)}<br/>↔ ${esc(b.owner.identity.name)}: ${esc(b.group.persona)}</h3>
      <p class="hint">Similarity ${esc(graph.getEdgeAttribute(edge, 'label'))}. Top same-sign keyword pairs:</p><div class="g"></div>`;
    grid = createGrid(q(panel, '.g'), {
      rowData: pairs.slice(0, 15),
      domLayout: 'autoHeight',
      defaultColDef: { flex: 1, wrapText: true, autoHeight: true },
      columnDefs: [
        { field: 'a', headerName: a.owner.id },
        { field: 'b', headerName: b.owner.id },
        { field: 'score', maxWidth: 90, valueFormatter: (p) => p.value.toFixed(2), cellStyle: (p) => heat(p.value) },
      ],
    });
  });

  renderer.on('clickNode', ({ node }) => {
    grid?.destroy();
    grid = undefined;
    const n = byKey(node);
    const persona = n.owner.personas.personas.find((p) => p.persona === n.group.persona);
    panel.innerHTML = `<h3>${esc(n.owner.identity.name)}: ${esc(n.group.persona)}</h3><div class="g"></div>`;
    if (persona) grid = kvGrid(q(panel, '.g'), persona, () => store.touch(n.owner.personas), ['persona']);
  });

  q(root, '.thr').addEventListener('input', syncEdges);

  return () => {
    grid?.destroy();
    renderer.kill();
  };
}
