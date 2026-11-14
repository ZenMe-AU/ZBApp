/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import Graph from "graphology";
import Sigma from "sigma";
import { random } from "graphology-layout";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { createGrid, type GridApi } from "ag-grid-community";
import { store } from "../data/store";
import { preferenceKinds, type Person, type PreferenceKind } from "../data/types";
import { personaGroups, type PreferenceUse } from "../data/preferences";
import { heat, kindColor, personColor } from "../shared/colors";
import { esc, q } from "../shared/dom";
import { kvGrid } from "../shared/grid";
import { normalize } from "../shared/sets";

interface PrefRow extends PreferenceUse {
  owner: Person
  persona: string
  edge: string
}

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <h2>Persona ↔ preference network</h2>
    <p class="hint">Identity → persona → keyword. Keyword nodes are shared across identities; edge colour = kind, width = |affinity|. Click a persona or keyword to edit.</p>
    <div class="toolbar">
      ${preferenceKinds.map(k => `<label style="color:${kindColor[k]}"><input type="checkbox" class="kind" value="${k}" checked /> ${k}</label>`).join("")}
      <label>Min |affinity| <input class="min" type="range" min="0" max="1" step="0.1" value="0" /></label>
      <label><input type="checkbox" class="shared" /> Only keywords used by 2+ identities</label>
    </div>
    <div class="split"><div class="graph"></div><aside class="panel"><p class="empty">Click a persona or keyword node.</p></aside></div>`;

  const panel = q(root, ".panel");
  const graph = new Graph({ type: "undirected" });
  let rows: PrefRow[] = [];

  const build = () => {
    const kinds = new Set([...root.querySelectorAll<HTMLInputElement>(".kind:checked")].map(c => c.value as PreferenceKind));
    const min = Number(q<HTMLInputElement>(root, ".min").value);
    const sharedOnly = q<HTMLInputElement>(root, ".shared").checked;
    rows = store.people.flatMap(owner =>
      personaGroups(owner).flatMap((g, gi) =>
        g.preferences
          .filter(use => kinds.has(use.pref.kind) && Math.abs(use.membership.affinity) >= min)
          .map(use => ({ owner, persona: g.persona, ...use, edge: `${owner.id}|${gi}|${normalize(use.pref.keyword)}|${use.pref.kind}` })),
      ),
    );
    const usage = new Map<string, Set<string>>();
    rows.forEach(r => usage.set(normalize(r.pref.keyword), (usage.get(normalize(r.pref.keyword)) ?? new Set()).add(r.owner.id)));
    if (sharedOnly) rows = rows.filter(r => usage.get(normalize(r.pref.keyword))!.size > 1);

    graph.clear();
    store.people.forEach((p, i) => {
      graph.addNode(`p:${p.id}`, { label: p.identity.name, size: 16, color: personColor(i), x: 0, y: 0 });
      personaGroups(p).forEach((g, gi) => {
        graph.addNode(`g:${p.id}|${gi}`, { label: g.persona, size: 8, color: personColor(i), x: 0, y: 0 });
        graph.addEdge(`p:${p.id}`, `g:${p.id}|${gi}`, { color: "#bbb", size: 2 });
      });
    });
    for (const r of rows) {
      const kw = `k:${normalize(r.pref.keyword)}`;
      if (!graph.hasNode(kw)) graph.addNode(kw, { label: r.pref.keyword, size: 3, color: "#777", x: 0, y: 0 });
      graph.setNodeAttribute(kw, "size", 2 + usage.get(normalize(r.pref.keyword))!.size * 2);
      const gi = r.edge.split("|")[1];
      if (!graph.hasEdge(r.edge)) {
        graph.addEdgeWithKey(r.edge, `g:${r.owner.id}|${gi}`, kw, { color: kindColor[r.pref.kind], size: 0.5 + Math.abs(r.membership.affinity) * 3 });
      }
    }
    random.assign(graph);
    forceAtlas2.assign(graph, { iterations: 400, settings: { ...forceAtlas2.inferSettings(graph), gravity: 2 } });
  };
  build();

  const renderer = new Sigma(graph, q(root, ".graph"), { labelRenderedSizeThreshold: 6 });

  let grid: GridApi | undefined;
  const showKeyword = (node: string) => {
    grid?.destroy();
    const matches = rows.filter(r => `k:${normalize(r.pref.keyword)}` === node);
    panel.innerHTML = `<h3>${esc(graph.getNodeAttribute(node, "label"))}</h3><div class="g"></div>`;
    grid = createGrid<PrefRow>(q(panel, ".g"), {
      rowData: matches,
      domLayout: "autoHeight",
      defaultColDef: { flex: 1 },
      columnDefs: [
        { headerName: "Identity", valueGetter: p => p.data!.owner.identity.name },
        { field: "persona", flex: 2, wrapText: true, autoHeight: true },
        { field: "pref.kind", headerName: "Kind", editable: true, cellEditor: "agSelectCellEditor", cellEditorParams: { values: preferenceKinds } },
        { field: "membership.affinity", headerName: "Affinity", editable: true, cellDataType: "number", cellStyle: p => heat(p.value) },
      ],
      onCellValueChanged: (e) => {
        store.touch(e.data.owner.properties);
        e.api.refreshCells({ force: true });
        for (const row of rows.filter(row => row.pref === e.data.pref)) {
          if (graph.hasEdge(row.edge)) {
            graph.mergeEdgeAttributes(row.edge, { color: kindColor[row.pref.kind], size: 0.5 + Math.abs(row.membership.affinity) * 3 });
          }
        }
      },
    });
  };

  const showPersona = (node: string) => {
    grid?.destroy();
    const [id, gi] = node.slice(2).split("|");
    const owner = store.person(id)!;
    const name = personaGroups(owner)[Number(gi)].persona;
    const persona = owner.personas.personas.find(p => p.persona === name);
    panel.innerHTML = `<h3>${esc(owner.identity.name)}: ${esc(name)}</h3><div class="g"></div>`;
    if (!persona) {
      panel.insertAdjacentHTML("beforeend", "<p class=\"empty\">No matching entry in the personas file.</p>");
      grid = undefined;
      return;
    }
    grid = kvGrid(q(panel, ".g"), persona, () => store.touch(owner.personas), ["persona"]);
  };

  renderer.on("clickNode", ({ node }) => {
    if (node.startsWith("k:")) showKeyword(node);
    else if (node.startsWith("g:")) showPersona(node);
  });
  root.querySelectorAll(".toolbar input").forEach(i => i.addEventListener("change", build));

  return () => {
    grid?.destroy();
    renderer.kill();
  };
}
