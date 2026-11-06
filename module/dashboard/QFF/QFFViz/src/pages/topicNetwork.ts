import Graph from 'graphology';
import Sigma from 'sigma';
import { random } from 'graphology-layout';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { createGrid, type GridApi } from 'ag-grid-community';
import { store } from '../data/store';
import { personColor } from '../shared/colors';
import { esc, q } from '../shared/dom';
import { itemsFor, normalize, sourceOptions, type SetSource } from '../shared/sets';

interface Occurrence {
  person: string;
  where: string;
  text: string;
  apply: (next: string | null) => void;
}

/** Every place a topic appears (preference keywords and relation topics), with a closure to rename/remove it. */
function occurrences(topic: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const p of store.people) {
    for (const g of p.properties.personas) {
      for (const pref of g.preferences.filter((x) => normalize(x.keyword) === topic)) {
        out.push({
          person: p.identity.name,
          where: `${g.persona} (${pref.kind} ${pref.affinity})`,
          text: pref.keyword,
          apply: (next) => {
            if (next) pref.keyword = next;
            else g.preferences.splice(g.preferences.indexOf(pref), 1);
            store.touch(p.properties);
          },
        });
      }
    }
    for (const r of p.relations.relations) {
      for (const key of ['topics_shared', 'topics_private'] as const) {
        const i = r[key].findIndex((t) => normalize(t) === topic);
        if (i < 0) continue;
        out.push({
          person: p.identity.name,
          where: `relation → ${store.nameOf(r.contact_ref)} (${key})`,
          text: r[key][i],
          apply: (next) => {
            if (next) r[key][i] = next;
            else r[key].splice(i, 1);
            store.touch(p.relations);
          },
        });
      }
    }
  }
  return out;
}

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <h2>Identity ↔ topic network</h2>
    <p class="hint">Bipartite graph: identities (large) connect to the topics in the chosen source. Hover to focus; click a topic to rename or remove it everywhere.</p>
    <div class="toolbar">
      <select class="source">${sourceOptions('relationShared')}</select>
      <label>Min. identities per topic <input class="min" type="number" min="1" value="1" style="width:60px" /></label>
    </div>
    <div class="split"><div class="graph"></div><aside class="panel"><p class="empty">Click a topic node.</p></aside></div>`;

  const panel = q(root, '.panel');
  const graph = new Graph({ type: 'undirected' });
  let hovered: string | undefined;

  const build = () => {
    const source = q<HTMLSelectElement>(root, '.source').value as SetSource;
    const min = Number(q<HTMLInputElement>(root, '.min').value) || 1;
    graph.clear();
    const owners = new Map<string, string[]>();
    store.people.forEach((p) => itemsFor(p, source).forEach((t) => owners.set(t, [...(owners.get(t) ?? []), p.id])));
    store.people.forEach((p, i) => graph.addNode(p.id, { label: p.identity.name, size: 16, color: personColor(i), x: 0, y: 0 }));
    for (const [topic, ids] of owners) {
      if (ids.length < min) continue;
      graph.addNode(`t:${topic}`, { label: topic, size: 3 + ids.length * 2, color: ids.length > 1 ? '#555' : '#aaa', x: 0, y: 0 });
      ids.forEach((id) => graph.addEdge(id, `t:${topic}`, { color: '#ccd3da', size: 1 }));
    }
    random.assign(graph);
    forceAtlas2.assign(graph, { iterations: 400, settings: forceAtlas2.inferSettings(graph) });
  };
  build();

  const renderer = new Sigma(graph, q(root, '.graph'), {
    labelRenderedSizeThreshold: 4,
    nodeReducer: (node, data) =>
      hovered && node !== hovered && !graph.areNeighbors(node, hovered) ? { ...data, color: '#eee', label: '' } : data,
    edgeReducer: (edge, data) => (hovered && !graph.hasExtremity(edge, hovered) ? { ...data, hidden: true } : data),
  });
  renderer.on('enterNode', ({ node }) => {
    hovered = node;
    renderer.refresh();
  });
  renderer.on('leaveNode', () => {
    hovered = undefined;
    renderer.refresh();
  });

  let grid: GridApi | undefined;
  const showTopic = (topic: string) => {
    grid?.destroy();
    const occ = occurrences(topic);
    panel.innerHTML = `
      <h3>${esc(topic)}</h3>
      <div class="toolbar"><input class="rename" value="${esc(topic)}" /><button class="apply primary">Rename everywhere</button><button class="remove danger">Remove everywhere</button></div>
      <div class="occ"></div>`;
    grid = createGrid<Occurrence>(q(panel, '.occ'), {
      rowData: occ,
      domLayout: 'autoHeight',
      defaultColDef: { flex: 1, wrapText: true, autoHeight: true },
      columnDefs: [{ field: 'person' }, { field: 'where', flex: 2 }, { field: 'text' }],
    });
    q(panel, '.apply').addEventListener('click', () => {
      const next = q<HTMLInputElement>(panel, '.rename').value.trim();
      if (!next) return;
      occ.forEach((o) => o.apply(next));
      build();
      showTopic(normalize(next));
    });
    q(panel, '.remove').addEventListener('click', () => {
      if (!confirm(`Remove "${topic}" from ${occ.length} place(s)?`)) return;
      [...occ].reverse().forEach((o) => o.apply(null));
      build();
      grid?.destroy();
      grid = undefined;
      panel.innerHTML = '<p class="empty">Removed.</p>';
    });
  };

  renderer.on('clickNode', ({ node }) => {
    if (node.startsWith('t:')) showTopic(node.slice(2));
  });
  q(root, '.source').addEventListener('change', build);
  q(root, '.min').addEventListener('change', build);

  return () => {
    grid?.destroy();
    renderer.kill();
  };
}
