import { createGrid, type ColDef, type GridApi } from 'ag-grid-community';
import { heat } from '../shared/colors';
import { esc, openInfo, q } from '../shared/dom';
import { best, loadModes, modeKeywords, modeScores, scoreMethods, type ModeVectors, type ScoreMethod } from '../shared/modes';

interface Row {
  keyword: string;
  kinds: string;
  owners: string;
  label: string;
  best: string;
  margin: number;
  correct: string;
  [mode: string]: string | number;
}

const helpHtml = `
  <p>Each row is a keyword; each column is an <b>interest mode</b> weighted average of its submodes (from <code>QFF/interest-modes.json</code>). Cells show how strongly the keyword points at that mode.</p>
  <h4>Score methods</h4>
  <ul>
    <li><b>Raw cosine</b>: plain similarity. Topic dominates, so a keyword can score high for every mode whose phrase mentions related things (sport, music, places).</li>
    <li><b>Relative</b>: raw minus the keyword's mean across all modes. Removes the keyword's general pull, so only the <i>preference between modes</i> remains; positive = above its own average.</li>
    <li><b>Standardised</b>: relative divided by the keyword's spread across modes, so every row is on the same scale. Good for comparing rows, but it exaggerates rows where all modes are almost equal.</li>
  </ul>
  <p>All three pick the same best mode (ranking within a row is unchanged); they differ in how readable and comparable the cells are.</p>
  <h4>Columns</h4>
  <ul>
    <li><b>Label</b>: the mode implied by the leading verb (<i>watching</i> → spectate, <i>playing</i> → participate, <i>visiting</i> → visit, <i>taking</i> → create). These keywords form a small labelled test set.</li>
    <li><b>Best</b> / <b>Margin</b>: top mode and its lead over the runner-up (in the current method's units). Small margins mean the keyword is ambiguous about mode, typically topic-only wording such as <i>coffee</i> or <i>food</i>.</li>
    <li><b>✓ / ✗</b>: whether Best equals Label.</li>
  </ul>
  <p>Inferred modes are an analysis aid only; matching is unchanged.</p>`;

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="toolbar">
      <h2>Keyword × mode <button class="info-btn" title="How to read this page" aria-label="How to read this page">ⓘ</button></h2>
      <label>Score <select class="method">${Object.entries(scoreMethods).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label><input type="checkbox" class="all" /> Include wants, values and boundaries</label>
      <span class="hint info"></span>
    </div>
    <p class="hint summary"></p>
    <div class="fill"></div>`;
  q(root, '.info-btn').addEventListener('click', () => openInfo('How to read the keyword × mode heatmap', helpHtml));

  let grid: GridApi<Row> | undefined;
  let modes: ModeVectors | undefined;

  const draw = () => {
    if (!modes) return;
    const method = q<HTMLSelectElement>(root, '.method').value as ScoreMethod;
    const keywords = modeKeywords(q<HTMLInputElement>(root, '.all').checked);
    const rows: Row[] = keywords.map((k) => {
      const scores = modeScores(k.vec, modes!, method);
      const top = best(scores, modes!.names);
      return {
        keyword: k.text,
        kinds: k.kinds.join(', '),
        owners: k.owners.join(', '),
        label: k.label,
        best: top.mode,
        margin: top.margin,
        correct: k.label ? (k.label === top.mode ? '✓' : '✗') : '',
        ...Object.fromEntries(modes!.names.map((n, i) => [n, scores[i]])),
      };
    });
    const values = rows.flatMap((r) => modes!.names.map((n) => Math.abs(r[n] as number)));
    const scale = Math.max(...values, 0.01);
    const labelled = rows.filter((r) => r.label);
    const hits = labelled.filter((r) => r.correct === '✓').length;
    q(root, '.summary').textContent =
      `${rows.length} keywords. Labelled test set: ${hits}/${labelled.length} best-mode matches. ` +
      `Median margin: labelled ${median(labelled.map((r) => r.margin)).toFixed(3)}, unlabelled ${median(rows.filter((r) => !r.label).map((r) => r.margin)).toFixed(3)}.`;
    const fmt = method === 'z' ? 2 : 3;
    const columnDefs: ColDef<Row>[] = [
      { field: 'keyword', pinned: 'left', minWidth: 220, filter: true },
      { field: 'kinds', maxWidth: 110, filter: true },
      { field: 'label', headerName: 'Label', maxWidth: 100, filter: true },
      { field: 'best', headerName: 'Best', maxWidth: 110, filter: true },
      { field: 'margin', headerName: 'Margin', maxWidth: 90, valueFormatter: (p) => (p.value as number).toFixed(fmt) },
      { field: 'correct', headerName: '✓/✗', maxWidth: 70 },
      ...modes.names.map(
        (n): ColDef<Row> => ({
          field: n,
          headerName: n,
          headerTooltip: modes!.descriptions[n],
          maxWidth: 105,
          valueFormatter: (p) => (p.value as number).toFixed(fmt),
          cellStyle: (p) => ({ ...heat(p.value, scale), fontWeight: p.data?.best === n ? '700' : '400' }),
        }),
      ),
      { field: 'owners', headerName: 'Identities', minWidth: 200, filter: true },
    ];
    grid?.destroy();
    grid = createGrid<Row>(q(root, '.fill'), {
      rowData: rows,
      columnDefs,
      defaultColDef: { flex: 1, sortable: true, resizable: true },
      tooltipShowDelay: 300,
    });
  };

  loadModes()
    .then((m) => {
      modes = m;
      q(root, '.info').textContent = m.names.length ? `${m.names.length} modes · ${m.model}` : '⚠ No interest-mode vectors yet: run Embeddings → Update.';
      draw();
    })
    .catch((err) => (q(root, '.summary').innerHTML = `<b>${esc(String(err))}</b>`));
  root.querySelectorAll('select, input').forEach((el) => el.addEventListener('change', draw));
  return () => grid?.destroy();
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}
