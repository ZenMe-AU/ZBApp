import { createGrid, type GridApi } from 'ag-grid-community';
import { store } from '../data/store';
import type { Person, Preference, PropertiesPersona } from '../data/types';
import { heat } from '../shared/colors';
import { esc, personOptions, q } from '../shared/dom';
import { cosine, hasVector, modelSummary } from '../shared/vectors';

interface PairSignal {
  a: Preference;
  b: Preference;
  concept: number;
  kind: number;
  raw: number;
}

interface PersonaMatch {
  a: PropertiesPersona;
  b: PropertiesPersona;
  score: number | null;
  retained: PairSignal[];
  discarded: number;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Demonstration scoring from matching.md, with tunable cut-offs. */
function matchPersonas(pa: Person, a: PropertiesPersona, pb: Person, b: PropertiesPersona, conceptCut: number, kindCut: number): PersonaMatch {
  const kindSim = (ka: string, kb: string) => {
    const va = pa.properties.kind_vectors?.[ka];
    const vb = pb.properties.kind_vectors?.[kb];
    return va && vb ? cosine(va, vb) : ka === kb ? 1 : 0;
  };
  const retained: PairSignal[] = [];
  let discarded = 0;
  for (const x of a.preferences) {
    for (const y of b.preferences) {
      if (!hasVector(x.embedding) || !hasVector(y.embedding)) continue;
      const concept = cosine(x.embedding, y.embedding);
      const kind = kindSim(x.kind, y.kind);
      if (concept < conceptCut || kind < kindCut) continue;
      const raw = concept * kind * x.affinity * y.affinity;
      if (raw > 0) retained.push({ a: x, b: y, concept, kind, raw });
      else discarded++;
    }
  }
  const side = (pick: (s: PairSignal) => Preference) => {
    const byPref = new Map<Preference, number[]>();
    retained.forEach((s) => byPref.set(pick(s), [...(byPref.get(pick(s)) ?? []), s.raw]));
    return [...byPref.values()].map(mean);
  };
  const dirA = side((s) => s.a);
  const dirB = side((s) => s.b);
  return { a, b, retained, discarded, score: dirA.length && dirB.length ? (mean(dirA) + mean(dirB)) / 2 : null };
}

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="toolbar">
      <h2>Match preview</h2>
      <select class="a">${personOptions(store.people[0]?.id)}</select> ↔ <select class="b">${personOptions(store.people[1]?.id)}</select>
      <label>Concept ≥ <input class="cc" type="range" min="0" max="1" step="0.01" value="0.55" /> <b class="cc-val"></b></label>
      <label>Kind ≥ <input class="kc" type="range" min="0" max="1" step="0.01" value="0.55" /> <b class="kc-val"></b></label>
      <span class="hint model"></span>
    </div>
    <p class="hint summary"></p>
    <div class="split">
      <div class="scroll"><h3>Persona pair scores</h3><div class="matrix"></div><h3>Kind similarity</h3><div class="kinds"></div></div>
      <aside class="panel"><p class="empty">Click a score to see the evidence.</p></aside>
    </div>`;

  q(root, '.model').textContent = modelSummary(store.people);
  const panel = q(root, '.panel');
  let grids: GridApi[] = [];
  let detail: GridApi[] = [];

  const showDetail = (m: PersonaMatch, nameA: string, nameB: string) => {
    detail.forEach((g) => g.destroy());
    panel.innerHTML = `<h3>${esc(nameA)}: ${esc(m.a.persona)}<br/>↔ ${esc(nameB)}: ${esc(m.b.persona)}</h3>
      <p class="hint">Score ${m.score?.toFixed(3) ?? '—'} · ${m.retained.length} retained pairs · ${m.discarded} opposite-sign pairs discarded</p><div class="g"></div>`;
    detail = [
      createGrid<PairSignal>(q(panel, '.g'), {
        rowData: [...m.retained].sort((x, y) => y.raw - x.raw),
        domLayout: 'autoHeight',
        defaultColDef: { flex: 1, wrapText: true, autoHeight: true, sortable: true },
        columnDefs: [
          { headerName: nameA, valueGetter: (p) => `${p.data!.a.keyword} (${p.data!.a.kind} ${p.data!.a.affinity})`, flex: 2 },
          { headerName: nameB, valueGetter: (p) => `${p.data!.b.keyword} (${p.data!.b.kind} ${p.data!.b.affinity})`, flex: 2 },
          { field: 'concept', maxWidth: 85, valueFormatter: (p) => p.value.toFixed(2) },
          { field: 'kind', maxWidth: 70, valueFormatter: (p) => p.value.toFixed(2) },
          { field: 'raw', maxWidth: 80, valueFormatter: (p) => p.value.toFixed(3), cellStyle: (p) => heat(p.value) },
        ],
      }),
    ];
  };

  const draw = () => {
    grids.forEach((g) => g.destroy());
    const pa = store.person(q<HTMLSelectElement>(root, '.a').value)!;
    const pb = store.person(q<HTMLSelectElement>(root, '.b').value)!;
    const cc = Number(q<HTMLInputElement>(root, '.cc').value);
    const kc = Number(q<HTMLInputElement>(root, '.kc').value);
    q(root, '.cc-val').textContent = cc.toFixed(2);
    q(root, '.kc-val').textContent = kc.toFixed(2);

    const matches = pa.properties.personas.map((a) => pb.properties.personas.map((b) => matchPersonas(pa, a, pb, b, cc, kc)));
    const flat = matches.flat();
    q(root, '.summary').textContent = `${flat.filter((m) => m.score !== null).length} of ${flat.length} persona pairs match; ${flat.reduce((s, m) => s + m.retained.length, 0)} retained pair signals, ${flat.reduce((s, m) => s + m.discarded, 0)} opposite-sign pairs discarded.`;

    const kinds = [...new Set([...Object.keys(pa.properties.kind_vectors ?? {}), ...Object.keys(pb.properties.kind_vectors ?? {})])];
    grids = [
      createGrid<{ persona: string; row: PersonaMatch[] }>(q(root, '.matrix'), {
        rowData: pa.properties.personas.map((a, i) => ({ persona: a.persona, row: matches[i] })),
        domLayout: 'autoHeight',
        defaultColDef: { flex: 1, wrapHeaderText: true, autoHeaderHeight: true },
        columnDefs: [
          { field: 'persona', headerName: `${pa.identity.name} \\ ${pb.identity.name}`, flex: 2, wrapText: true, autoHeight: true },
          ...pb.properties.personas.map((b, j) => ({
            headerName: b.persona,
            valueGetter: (p: { data?: { row: PersonaMatch[] } }) => p.data!.row[j].score,
            valueFormatter: (p: { value: number | null }) => (p.value === null ? '—' : p.value.toFixed(3)),
            cellStyle: (p: { value: number | null }) => heat(p.value, 0.5),
          })),
        ],
        onCellClicked: (e) => {
          const j = pb.properties.personas.findIndex((b) => b.persona === e.colDef.headerName);
          if (j >= 0) showDetail(e.data!.row[j], pa.identity.name, pb.identity.name);
        },
      }),
      createGrid<{ kind: string }>(q(root, '.kinds'), {
        rowData: kinds.map((kind) => ({ kind })),
        domLayout: 'autoHeight',
        defaultColDef: { flex: 1 },
        columnDefs: [
          { field: 'kind', headerName: `${pa.id} \\ ${pb.id}` },
          ...kinds.map((kb) => ({
            headerName: kb,
            valueGetter: (p: { data?: { kind: string } }) => {
              const va = pa.properties.kind_vectors?.[p.data!.kind];
              const vb = pb.properties.kind_vectors?.[kb];
              return va && vb ? cosine(va, vb) : null;
            },
            valueFormatter: (p: { value: number | null }) => (p.value === null ? '—' : p.value.toFixed(3)),
            cellStyle: (p: { value: number | null }) => ({ ...heat(p.value), fontWeight: p.value !== null && p.value >= kc ? 700 : 400 }),
          })),
        ],
      }),
    ];
  };

  root.querySelectorAll('.toolbar select, .toolbar input').forEach((el) => el.addEventListener('input', draw));
  draw();

  return () => [...grids, ...detail].forEach((g) => g.destroy());
}
