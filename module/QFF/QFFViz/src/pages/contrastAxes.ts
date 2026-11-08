import Plotly, { type Data, type PlotlyHTMLElement } from 'plotly.js-dist-min';
import { store } from '../data/store';
import type { PreferenceKind } from '../data/types';
import { kindColor } from '../shared/colors';
import { esc, openInfo, q } from '../shared/dom';
import { best, contrast, loadModes, modeColor, modeKeywords, modeScores, type ModeKeyword, type ModeVectors } from '../shared/modes';
import { cosine } from '../shared/vectors';

type ColourBy = 'label' | 'best' | 'kind' | 'identity';
type SizeBy = 'count' | 'best-score' | 'uniform';

const colourModes: Record<ColourBy, string> = {
  label: 'Verb label',
  best: 'Inferred best mode',
  kind: 'Kind',
  identity: 'Identity',
};

const sizeModes: Record<SizeBy, string> = {
  count: 'Identity count',
  'best-score': 'Best mode score',
  uniform: 'Uniform',
};

const palette = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'];

const helpHtml = `
  <p>A <b>contrast axis</b> is the direction from one mode's reference vector to another's. A keyword's position on the axis <code>A − B</code> is</p>
  <p style="text-align:center"><code>cos(keyword, A) − cos(keyword, B)</code></p>
  <p>Example: on <b>spectate − participate</b>, <i>watching cricket</i> lands on the positive side and <i>playing social cricket</i> on the negative side, even though both are about cricket. Whatever the two reference phrases have in common (sport, activity, leisure) cancels out, so the axis mostly measures <i>how</i> someone engages, not <i>what</i> with.</p>
  <h4>Why not just raw similarity?</h4>
  <ul>
    <li>Raw similarity mixes topic and mode: <i>watching cricket</i> is fairly close to <i>participate</i> too (0.32), because the participate phrase mentions sport.</li>
    <li>Subtracting cancels the shared topic and leaves the mode difference: here +0.16 towards spectate, while the cricket-playing keyword sits at −0.05.</li>
    <li>Zero means "no preference between A and B", not "unrelated". Topic-only keywords (<i>coffee</i>, <i>wildlife</i>) cluster near 0 on most axes.</li>
  </ul>
  <h4>Reading the chart</h4>
  <ul>
    <li><b>X</b> and <b>Y</b> are two independently chosen axes. Choosing unrelated pairs (e.g. spectate − participate and create − learn) spreads keywords into quadrants.</li>
    <li><b>Mode vectors</b> (checkbox) adds diamonds for the reference phrases themselves, showing where a "pure" mode would land. They sit far out (about ±0.5) compared with real keywords (about ±0.2), so they are off by default.</li>
    <li>Dashed lines at 0 split each axis into its A side and B side.</li>
    <li><b>Same-topic pairs</b> (cosine ≥ the slider, e.g. watching/playing tennis) are joined by a line, so you can see the axis separate them while topic keeps them related.</li>
    <li>Colour by <i>Verb label</i> to check the axis against keywords whose wording states the mode; grey = topic-only wording.</li>
  </ul>
  <p>Contrast scores could later act as a mode-compatibility signal in matching (e.g. two spectators of the same sport), but matching rules are unchanged for now.</p>`;

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="toolbar">
      <h2>Contrast axes <button class="info-btn" title="How to read this page" aria-label="How to read this page">ⓘ</button></h2>
      <label>X <select class="xa"></select> − <select class="xb"></select></label>
      <label>Y <select class="ya"></select> − <select class="yb"></select></label>
      <label>Colour by <select class="colour">${Object.entries(colourModes).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>Size by <select class="size">${Object.entries(sizeModes).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label>Join same-topic ≥ <input class="pair" type="range" min="0.3" max="1" step="0.01" value="0.6" /> <b class="pair-val"></b></label>
      <label><input type="checkbox" class="all" /> All kinds</label>
      <label title="Pure mode vectors sit far out on their own axes and shrink the keyword cloud"><input type="checkbox" class="refs" /> Mode vectors</label>
      <span class="hint info"></span>
    </div>
    <div class="split resizable">
      <div class="plot" style="height:100%;min-height:0"></div>
      <div class="splitter" title="Drag to resize"></div>
      <aside class="panel"><p class="empty">Click a keyword to see its score on every mode and every contrast axis.</p></aside>
    </div>`;
  q(root, '.info-btn').addEventListener('click', () => openInfo('What is a contrast axis?', helpHtml));

  const plotEl = q(root, '.plot') as unknown as PlotlyHTMLElement & HTMLElement;
  const panel = q(root, '.panel');
  let modes: ModeVectors | undefined;
  let keywords: ModeKeyword[] = [];
  const sel = (c: string) => q<HTMLSelectElement>(root, c);

  const groupOf = (k: ModeKeyword, by: ColourBy): string => {
    switch (by) {
      case 'label': return k.label || '(topic only)';
      case 'best': return best(modeScores(k.vec, modes!, 'raw'), modes!.names).mode;
      case 'kind': return k.kinds.join(' + ');
      case 'identity': return k.owners.length > 1 ? 'Shared by 2+ identities' : k.owners[0];
    }
  };
  const colourOf = (group: string, by: ColourBy, n: number): string => {
    if (by === 'label') return group.startsWith('(') ? '#c3cad2' : modeColor(group);
    if (by === 'best') return modeColor(group);
    if (by === 'kind') return kindColor[group as PreferenceKind] ?? '#777';
    return group.startsWith('Shared') ? '#222' : palette[n % palette.length];
  };

  const draw = () => {
    if (!modes) return;
    const [xa, xb, ya, yb] = ['.xa', '.xb', '.ya', '.yb'].map((c) => sel(c).value);
    const by = sel('.colour').value as ColourBy;
    const sizeBy = sel('.size').value as SizeBy;
    const pairCut = Number(q<HTMLInputElement>(root, '.pair').value);
    q(root, '.pair-val').textContent = pairCut.toFixed(2);
    keywords = modeKeywords(q<HTMLInputElement>(root, '.all').checked);
    const xs = keywords.map((k) => contrast(k.vec, modes!, xa, xb));
    const ys = keywords.map((k) => contrast(k.vec, modes!, ya, yb));

    const lx: (number | null)[] = [], ly: (number | null)[] = [];
    keywords.forEach((a, i) =>
      keywords.forEach((b, j) => {
        if (j <= i || cosine(a.vec, b.vec) < pairCut) return;
        lx.push(xs[i], xs[j], null);
        ly.push(ys[i], ys[j], null);
      }),
    );
    
    const getSizes = (indices: number[]): (number | null)[] => {
      if (sizeBy === 'uniform') return indices.map(() => 9);
      if (sizeBy === 'count') {
        const maxCount = Math.max(...keywords.map((k) => k.owners.length));
        return indices.map((i) => 5 + (keywords[i].owners.length / maxCount) * 12);
      }
      if (sizeBy === 'best-score') {
        const scores = keywords.map((k) => {
          const raw = modeScores(k.vec, modes!, 'raw');
          return Math.max(...raw);
        });
        const maxScore = Math.max(...scores);
        return indices.map((i) => 5 + (scores[i] / maxScore) * 12);
      }
      return indices.map(() => 9);
    };
    
    const groups = new Map<string, number[]>();
    keywords.forEach((k, i) => groups.set(groupOf(k, by), [...(groups.get(groupOf(k, by)) ?? []), i]));
    const traces: Data[] = [
      { type: 'scatter', mode: 'lines', name: `Same topic ≥ ${pairCut.toFixed(2)}`, x: lx, y: ly, hoverinfo: 'skip', line: { color: '#c9d3dd', width: 1 } } as Data,
      ...[...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([group, idx], n) => ({
          type: 'scatter',
          mode: 'markers+text',
          name: `${group} (${idx.length})`,
          x: idx.map((i) => xs[i]),
          y: idx.map((i) => ys[i]),
          text: idx.map((i) => keywords[i].text),
          textposition: 'top center',
          textfont: { size: 10, color: '#4a5560' },
          customdata: idx,
          hovertemplate: `%{text}<br>${xa} − ${xb}: %{x:.3f}<br>${ya} − ${yb}: %{y:.3f}<extra>${esc(group)}</extra>`,
          marker: { size: getSizes(idx), color: colourOf(group, by, n), line: { color: '#fff', width: 1 } },
        }) as Data),
    ];
    if (q<HTMLInputElement>(root, '.refs').checked) {
      traces.push({
        type: 'scatter',
        mode: 'markers+text',
        name: 'Mode reference vectors',
        x: modes.names.map((n) => contrast(modes!.vectors[n], modes!, xa, xb)),
        y: modes.names.map((n) => contrast(modes!.vectors[n], modes!, ya, yb)),
        text: modes.names,
        textposition: 'bottom center',
        textfont: { size: 11, color: '#000' },
        hovertemplate: 'mode vector: %{text}<extra></extra>',
        marker: { symbol: 'diamond', size: 12, color: modes.names.map(modeColor), line: { color: '#000', width: 1.5 } },
      } as Data);
    }
    const zero = { color: '#8a96a3', width: 1, dash: 'dash' as const };
    void Plotly.react(
      plotEl,
      traces,
      {
        margin: { l: 60, r: 10, t: 10, b: 50 },
        dragmode: 'pan',
        hovermode: 'closest',
        legend: { font: { size: 11 }, bgcolor: 'rgba(255,255,255,0.8)' },
        xaxis: { title: { text: `← ${xb}    ${xa} − ${xb}    ${xa} →` }, zeroline: false },
        yaxis: { title: { text: `← ${yb}    ${ya} − ${yb}    ${ya} →` }, zeroline: false },
        shapes: [
          { type: 'line', xref: 'x', yref: 'paper', x0: 0, x1: 0, y0: 0, y1: 1, line: zero },
          { type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: 0, y1: 0, line: zero },
        ],
      },
      { responsive: true, displaylogo: false },
    );
  };

  const showDetail = (i: number) => {
    const k = keywords[i];
    const raw = modeScores(k.vec, modes!, 'raw');
    const rel = modeScores(k.vec, modes!, 'relative');
    const rows = modes!.names
      .map((n, j) => ({ n, raw: raw[j], rel: rel[j] }))
      .sort((a, b) => b.raw - a.raw)
      .map((r) => `<tr><td><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${modeColor(r.n)}"></i> ${r.n}</td><td>${r.raw.toFixed(3)}</td><td>${r.rel >= 0 ? '+' : ''}${r.rel.toFixed(3)}</td></tr>`)
      .join('');
    const axes = modes!.names.flatMap((a, ai) => modes!.names.slice(ai + 1).map((b) => ({ a, b, v: contrast(k.vec, modes!, a, b) })));
    axes.sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
    panel.innerHTML = `
      <h3>${esc(k.text)}</h3>
      <p class="hint">${k.kinds.join(', ')} · ${k.label ? `verb label <b>${k.label}</b>` : 'topic-only wording'}<br>${k.personas.map(esc).join('<br>')}</p>
      <h3>Mode scores</h3>
      <table class="mini"><tr><th>Mode</th><th>Raw</th><th>Relative</th></tr>${rows}</table>
      <h3>Strongest contrast axes</h3>
      <table class="mini"><tr><th>Axis</th><th>Score</th></tr>${axes.slice(0, 8).map((x) => `<tr><td>${x.v >= 0 ? `<b>${x.a}</b> − ${x.b}` : `<b>${x.b}</b> − ${x.a}`}</td><td>${Math.abs(x.v).toFixed(3)}</td></tr>`).join('')}</table>`;
  };

  loadModes()
    .then((m) => {
      modes = m;
      if (!m.names.length) {
        q(root, '.info').textContent = '⚠ No interest-mode vectors yet: run Embeddings → Update.';
        return;
      }
      const opts = m.names.map((n) => `<option value="${n}" title="${esc(m.descriptions[n])}">${n}</option>`).join('');
      ['.xa', '.xb', '.ya', '.yb'].forEach((c) => (sel(c).innerHTML = opts));
      const pick = (c: string, v: string, fallback: number) => (sel(c).value = m.names.includes(v) ? v : m.names[fallback % m.names.length]);
      pick('.xa', 'spectate', 1);
      pick('.xb', 'participate', 0);
      pick('.ya', 'visit', 2);
      pick('.yb', 'create', 3);
      q(root, '.info').textContent = `${m.model} · ${store.people.length} identities`;
      draw();
      plotEl.on('plotly_click', (e) => {
        const idx = e.points[0]?.customdata;
        if (typeof idx === 'number') showDetail(idx);
      });
    })
    .catch((err) => (q(root, '.info').textContent = String(err)));

  root.querySelectorAll('select, input').forEach((el) => el.addEventListener('input', draw));
  
  plotEl.addEventListener('wheel', (e: WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    
    const zoomFactor = e.deltaY > 0 ? 1.05 : 0.95;
    
    const layout = plotEl.layout as any;
    if (!layout || !layout.xaxis || !layout.yaxis) return;
    
    const xRange = layout.xaxis.range;
    const yRange = layout.yaxis.range;
    
    // Zoom around the current view center, not the cursor position
    const xCenter = (xRange[0] + xRange[1]) / 2;
    const yCenter = (yRange[0] + yRange[1]) / 2;
    
    const xSpan = (xRange[1] - xRange[0]) * zoomFactor / 2;
    const ySpan = (yRange[1] - yRange[0]) * zoomFactor / 2;
    
    void Plotly.relayout(plotEl, {
      'xaxis.range': [xCenter - xSpan, xCenter + xSpan],
      'yaxis.range': [yCenter - ySpan, yCenter + ySpan],
    });
  });
  
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panStartXRange: [number, number] | null = null;
  let panStartYRange: [number, number] | null = null;
  
  plotEl.addEventListener('mousedown', (e: MouseEvent) => {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    
    const layout = plotEl.layout as any;
    if (layout?.xaxis?.range && layout?.yaxis?.range) {
      panStartXRange = [...layout.xaxis.range] as [number, number];
      panStartYRange = [...layout.yaxis.range] as [number, number];
    }
  });
  
  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isPanning || !panStartXRange || !panStartYRange) return;
    
    const rect = plotEl.getBoundingClientRect();
    const deltaX = e.clientX - panStartX;
    const deltaY = e.clientY - panStartY;
    
    const xSpan = panStartXRange[1] - panStartXRange[0];
    const ySpan = panStartYRange[1] - panStartYRange[0];
    
    const xShift = -(deltaX / rect.width) * xSpan;
    const yShift = (deltaY / rect.height) * ySpan;
    
    void Plotly.relayout(plotEl, {
      'xaxis.range': [panStartXRange[0] + xShift, panStartXRange[1] + xShift],
      'yaxis.range': [panStartYRange[0] + yShift, panStartYRange[1] + yShift],
    });
  });
  
  document.addEventListener('mouseup', () => {
    isPanning = false;
    panStartXRange = null;
    panStartYRange = null;
  });
  
  const splitter = q(root, '.splitter');
  const split = q(root, '.split');
  splitter.addEventListener('pointerdown', (e) => {
    splitter.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const rect = split.getBoundingClientRect();
      split.style.gridTemplateColumns = `minmax(0, 1fr) 6px ${Math.max(240, rect.right - ev.clientX)}px`;
    };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', () => splitter.removeEventListener('pointermove', move), { once: true });
  });
  return () => Plotly.purge(plotEl);
}
