import { createGrid, type GridApi } from 'ag-grid-community';
import { heat } from '../shared/colors';
import { esc, q } from '../shared/dom';
import { best, contrast, loadModes, modeKeywords, modeScores, type ModeVectors } from '../shared/modes';
import { cosine } from '../shared/vectors';

interface PairRow {
  a: string;
  b: string;
  topic: number;
  modeA: string;
  modeB: string;
  axis: string;
  sepA: number;
  sepB: number;
  separated: string;
}

/** Summarises how well each comparison method recovers the verb-labelled modes and separates same-topic pairs. */
export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="toolbar"><h2>Mode method comparison</h2><span class="hint info"></span></div>
    <div class="scroll" style="flex:none;max-height:45%">
      <table class="mini findings"></table>
      <p class="hint notes"></p>
    </div>
    <h3>Same-topic, different-mode pairs</h3>
    <p class="hint">Labelled keyword pairs with different verb labels. <i>Topic</i> is their direct cosine; the contrast axis between their two labels should put them on opposite sides of zero.</p>
    <div class="fill"></div>`;

  let grid: GridApi<PairRow> | undefined;

  const build = (modes: ModeVectors) => {
    const kws = modeKeywords(false);
    const labelled = kws.filter((k) => k.label && modes.names.includes(k.label));
    const method = (fn: (v: number[]) => number[]) => {
      let hits = 0;
      const margins: number[] = [];
      for (const k of labelled) {
        const top = best(fn(k.vec), modes.names);
        if (top.mode === k.label) hits++;
        margins.push(top.margin);
      }
      return { hits, margin: margins.reduce((s, x) => s + x, 0) / (margins.length || 1) };
    };
    const raw = method((v) => modeScores(v, modes, 'raw'));
    const rel = method((v) => modeScores(v, modes, 'relative'));
    const z = method((v) => modeScores(v, modes, 'z'));
    // Raw score of the correct mode vs mean raw score of the other modes.
    const ownVsOther = labelled.map((k) => {
      const s = modeScores(k.vec, modes, 'raw');
      const i = modes.names.indexOf(k.label);
      return s[i] - (s.reduce((t, x) => t + x, 0) - s[i]) / (s.length - 1);
    });
    const topicOnly = kws.filter((k) => !k.label).map((k) => best(modeScores(k.vec, modes, 'raw'), modes.names).margin);
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);

    const pairs: PairRow[] = [];
    labelled.forEach((a, i) =>
      labelled.slice(i + 1).forEach((b) => {
        if (a.label === b.label) return;
        const sepA = contrast(a.vec, modes, a.label, b.label);
        const sepB = contrast(b.vec, modes, a.label, b.label);
        pairs.push({ a: a.text, b: b.text, topic: cosine(a.vec, b.vec), modeA: a.label, modeB: b.label, axis: `${a.label} − ${b.label}`, sepA, sepB, separated: sepA > 0 && sepB < 0 ? '✓' : '✗' });
      }),
    );
    const sep = pairs.filter((p) => p.separated === '✓').length;
    const closePairs = pairs.filter((p) => p.topic >= 0.5);

    q(root, '.findings').innerHTML = `
      <tr><th>Method</th><th>What it measures</th><th>Labelled best-mode hits</th><th>Mean winning margin</th><th>Notes</th></tr>
      <tr><td><b>Raw cosine</b></td><td>Absolute closeness to each mode phrase</td><td>${raw.hits}/${labelled.length}</td><td>${raw.margin.toFixed(3)} (cosine)</td><td>Values are compressed (mostly 0.1–0.5) and carry topic; hard to compare between keywords.</td></tr>
      <tr><td><b>Relative</b></td><td>Raw minus the keyword's own mean</td><td>${rel.hits}/${labelled.length}</td><td>${rel.margin.toFixed(3)} (cosine)</td><td>Same ranking as raw; removes each keyword's general pull, so the heatmap reads as "more / less than usual".</td></tr>
      <tr><td><b>Standardised</b></td><td>Relative ÷ keyword spread</td><td>${z.hits}/${labelled.length}</td><td>${z.margin.toFixed(2)} (σ)</td><td>Same ranking; equal scale per row but inflates ambiguous rows.</td></tr>
      <tr><td><b>Contrast axis</b></td><td>cos(v, A) − cos(v, B) for one chosen pair</td><td colspan="2">${sep}/${pairs.length} cross-mode pairs on the correct sides</td><td>Answers one targeted question (e.g. spectator or player?) and cancels shared topic; ${closePairs.filter((p) => p.separated === '✓').length}/${closePairs.length} same-topic pairs (cosine ≥ 0.5) separated.</td></tr>`;
    q(root, '.notes').innerHTML =
      `Labelled keywords beat the mean of their other modes by ${avg(ownVsOther).toFixed(3)} raw cosine on average. ` +
      `Topic-only keywords (${topicOnly.length}) have a mean winning margin of only ${avg(topicOnly).toFixed(3)}, so their inferred mode is weak; wording with a verb gives the clearest signal. ` +
      `The test set is small (${labelled.length} keywords) and was worded deliberately, so treat these as sanity checks, not accuracy estimates.`;

    grid = createGrid<PairRow>(q(root, '.fill'), {
      rowData: pairs,
      defaultColDef: { flex: 1, sortable: true, filter: true, resizable: true },
      columnDefs: [
        { field: 'a', headerName: 'Keyword A', flex: 2 },
        { field: 'b', headerName: 'Keyword B', flex: 2 },
        { field: 'topic', headerName: 'Topic cosine', sort: 'desc', maxWidth: 120, valueFormatter: (p) => p.value.toFixed(3), cellStyle: (p) => heat(p.value) },
        { field: 'axis', headerName: 'Axis (A label − B label)', flex: 2 },
        { field: 'sepA', headerName: 'A on axis', maxWidth: 110, valueFormatter: (p) => p.value.toFixed(3), cellStyle: (p) => heat(p.value, 0.2) },
        { field: 'sepB', headerName: 'B on axis', maxWidth: 110, valueFormatter: (p) => p.value.toFixed(3), cellStyle: (p) => heat(p.value, 0.2) },
        { field: 'separated', headerName: 'Separated', maxWidth: 100 },
      ],
    });
    q(root, '.info').textContent = `${modes.model} · ${kws.length} interest keywords, ${labelled.length} verb-labelled`;
  };

  loadModes()
    .then((m) => (m.names.length ? build(m) : (q(root, '.info').textContent = '⚠ No interest-mode vectors yet: run Embeddings → Update.')))
    .catch((err) => (q(root, '.info').innerHTML = `<b>${esc(String(err))}</b>`));
  return () => grid?.destroy();
}
