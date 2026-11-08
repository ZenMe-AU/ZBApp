import Graph from 'graphology';
import Sigma from 'sigma';
import { createDrawCurvedEdgeLabel, createEdgeCurveProgram, DEFAULT_EDGE_CURVE_PROGRAM_OPTIONS } from '@sigma/edge-curve';
import type { EdgeLabelDrawingFunction } from 'sigma/rendering';
import type { GridApi } from 'ag-grid-community';
import { store } from '../data/store';
import type { Relation } from '../data/types';
import { personColor } from '../shared/colors';
import { esc, q } from '../shared/dom';
import { kvGrid } from '../shared/grid';

const edgeKey = (from: string, to: string) => `${from}->${to}`;

const drawCurvedLabel = createDrawCurvedEdgeLabel(DEFAULT_EDGE_CURVE_PROGRAM_OPTIONS);
const drawLabel: EdgeLabelDrawingFunction = (context, edge, source, target, settings) => {
  if (!edge.selected) return drawCurvedLabel(context, edge, source, target, settings);
  context.save();
  context.shadowColor = '#fff';
  context.shadowBlur = 8;
  // Repeated passes build up an opaque halo around the glyphs.
  for (let i = 0; i < 4; i++) drawCurvedLabel(context, edge, source, target, settings);
  context.restore();
};
const CurvedArrowProgram = createEdgeCurveProgram({
  arrowHead: { extremity: 'target', lengthToThicknessRatio: 2.5, widenessToThicknessRatio: 2 },
  drawLabel,
});

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <h2>Relationship network</h2>
    <p class="hint">Click a node or arrow to edit it. With a node selected, <b>Shift+click</b> another node to create a relation. Arrow width = number of shared topics.</p>
    <div class="legend"><span><i style="background:#2e9d5b"></i>reciprocal</span><span><i style="background:#e08a1e"></i>one-way</span>
      <label><input type="checkbox" class="labels" checked /> topic labels</label></div>
    <div class="split"><div class="graph"></div><aside class="panel"><p class="empty">Select a node or edge.</p></aside></div>`;

  const panel = q(root, '.panel');
  const graph = new Graph({ type: 'directed' });
  const n = store.people.length;
  store.people.forEach((p, i) =>
    graph.addNode(p.id, {
      label: p.identity.name,
      x: Math.cos((2 * Math.PI * i) / n),
      y: Math.sin((2 * Math.PI * i) / n),
      size: 12,
      color: personColor(i),
    }),
  );

  let selectedEdge: string | undefined;
  const syncEdges = () => {
    graph.clearEdges();
    for (const p of store.people) {
      for (const r of p.relations.relations) {
        if (!graph.hasNode(r.contact_ref) || graph.hasEdge(edgeKey(p.id, r.contact_ref))) continue;
        const reciprocal = store.person(r.contact_ref)?.relations.relations.some((x) => x.contact_ref === p.id);
        const color = reciprocal ? '#2e9d5b' : '#e08a1e';
        graph.addDirectedEdgeWithKey(edgeKey(p.id, r.contact_ref), p.id, r.contact_ref, {
          label: r.topics_shared.join(', '),
          size: 2 + r.topics_shared.length,
          color,
          labelColor: color,
          type: 'curved',
        });
      }
    }
    // Labels render in graph order, so re-add the selected edge last to draw it on top.
    if (selectedEdge && graph.hasEdge(selectedEdge)) {
      const attrs = graph.getEdgeAttributes(selectedEdge);
      const [from, to] = graph.extremities(selectedEdge);
      graph.dropEdge(selectedEdge);
      graph.addDirectedEdgeWithKey(selectedEdge, from, to, attrs);
    }
  };
  syncEdges();

  const selectEdge = (key: string | undefined) => {
    selectedEdge = key;
    syncEdges();
  };

  let selected: string | undefined;
  const renderer = new Sigma(graph, q(root, '.graph'), {
    renderEdgeLabels: true,
    enableEdgeEvents: true,
    zIndex: true,
    edgeLabelColor: { attribute: 'labelColor' },
    edgeProgramClasses: { curved: CurvedArrowProgram },
    nodeReducer: (node, data) => (node === selected ? { ...data, highlighted: true } : data),
    edgeReducer: (edge, data) =>
      edge === selectedEdge ? { ...data, zIndex: 1, selected: true, labelColor: '#000', forceLabel: true } : data,
  });

  let panelGrids: GridApi[] = [];
  const resetPanel = (html: string) => {
    panelGrids.forEach((g) => g.destroy());
    panelGrids = [];
    panel.innerHTML = html;
  };

  const showEdge = (key: string) => {
    const [from, to] = key.split('->');
    const owner = store.person(from)!;
    const rel = owner.relations.relations.find((r) => r.contact_ref === to);
    if (!rel) return;
    selectEdge(key);
    resetPanel(`<h3>${esc(owner.identity.name)} → ${esc(store.nameOf(to))}</h3><div class="kv"></div><p><button class="danger del">Delete relation</button></p>`);
    panelGrids.push(
      kvGrid(q(panel, '.kv'), rel, () => {
        store.touch(owner.relations);
        syncEdges();
      }, ['contact_ref']),
    );
    q(panel, '.del').addEventListener('click', () => {
      owner.relations.relations.splice(owner.relations.relations.indexOf(rel), 1);
      store.touch(owner.relations);
      selectEdge(undefined);
      resetPanel('<p class="empty">Relation deleted.</p>');
    });
  };

  const showNode = (id: string) => {
    const person = store.person(id)!;
    resetPanel(`
      <h3>${esc(person.identity.name)}</h3><div class="kv"></div>
      <h3>Relations</h3>
      <div class="list">${person.relations.relations
        .map((r) => `<button data-key="${esc(edgeKey(id, r.contact_ref))}">→ ${esc(store.nameOf(r.contact_ref))}</button>`)
        .join('')}</div>`);
    panelGrids.push(kvGrid(q(panel, '.kv'), person.identity, () => store.touch(person.identity), ['identity_id']));
    panel.querySelectorAll<HTMLButtonElement>('.list button').forEach((b) => b.addEventListener('click', () => showEdge(b.dataset.key!)));
  };

  renderer.on('clickNode', ({ node, event }) => {
    const shift = (event.original as MouseEvent).shiftKey;
    if (shift && selected && selected !== node) {
      const owner = store.person(selected)!;
      if (!owner.relations.relations.some((r) => r.contact_ref === node)) {
        const rel: Relation = { contact_ref: node, topics_shared: [], topics_private: [], source: 'manual' };
        owner.relations.relations.push(rel);
        store.touch(owner.relations);
        syncEdges();
      }
      showEdge(edgeKey(selected, node));
      return;
    }
    selected = node;
    selectEdge(undefined);
    renderer.refresh();
    showNode(node);
  });
  renderer.on('clickEdge', ({ edge }) => showEdge(edge));
  q<HTMLInputElement>(root, '.labels').addEventListener('change', (e) =>
    renderer.setSetting('renderEdgeLabels', (e.target as HTMLInputElement).checked),
  );
  renderer.on('clickStage', () => {
    selected = undefined;
    selectEdge(undefined);
    renderer.refresh();
  });

  return () => {
    panelGrids.forEach((g) => g.destroy());
    renderer.kill();
  };
}
