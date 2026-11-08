import { averageMode, modeIssue, parseInterestModes, submodeIssue, type InterestModesFile } from '../../../interest-modes';
import { esc, openInfo, q } from '../shared/dom';
import { modeKeywords } from '../shared/modes';
import { cosine } from '../shared/vectors';
import { store } from '../data/store';

const disabledWeights = new WeakMap<object, number>();

interface EditorResponse {
  revision: string;
  data: InterestModesFile;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `Request failed: ${response.status}`);
  return body as T;
}

export function render(root: HTMLElement): () => void {
  let disposed = false;
  let state = store.modes;
  let savedData = store.savedModes;
  let busy = false;
  const keywords = modeKeywords(true);
  const expanded = new Set<string>();
  root.classList.add('modes-page');
  root.innerHTML = `
    <div class="toolbar">
      <h2>Modes: Edit <button class="info-btn" title="How to edit modes" aria-label="How to edit modes">ⓘ</button></h2>
      <button class="calculate" disabled>Recalculate averages (offline)</button>
      <button class="refresh" disabled title="Refresh embeddings and calculate mode averages; uncached texts require Azure/internet">Refresh embeddings</button>
    </div>
    <div class="toolbar">
      <label>Test keyword <select class="keyword"><option value="">None</option>${keywords.map((k, i) => `<option value="${i}">${esc(k.text)}</option>`).join('')}</select></label>
      <span class="hint model"></span>
    </div>
    <p class="message" role="status" aria-live="polite">Loading modes...</p>
    <div class="mode-editor"></div>`;
  q(root, '.info-btn').addEventListener('click', () => openInfo('Editing modes', `
    <p>Edit modes and their weighted submodes. Global Save and Reload include mode edits and identity files. Draft edits survive menu navigation; View unsaved shows pending changes.</p>
    <p>Text changes clear embeddings. Save and refresh embeddings; mode averages are calculated automatically afterwards. Weight changes and deletions need only saving and offline recalculation.</p>
    <p>Select a test keyword to compare saved scores with a preview using current weights without saving. Scores are raw cosine, not probabilities.</p>`));
  const message = q(root, '.message');
  const list = q(root, '.mode-editor');
  const button = (selector: string) => q<HTMLButtonElement>(root, selector);
  const report = (text: string, error = false) => {
    message.textContent = text;
    message.hidden = !text;
    message.classList.toggle('mode-error', error);
  };
  const controls = () => {
    button('.calculate').disabled = !state || busy || store.busy || store.areModesDirty;
    button('.refresh').disabled = !state || busy || store.busy || store.dirtyCount > 0;
    button('.calculate').title = store.areModesDirty ? 'Save pending mode edits with global Save first.' : '';
    button('.refresh').title = store.dirtyCount ? 'Save or reload all pending edits first.' : 'Refresh embeddings and calculate mode averages; uncached texts require Azure/internet.';
    list.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement>('input, button, textarea')
      .forEach((el) => {
        const onlySubmode = el instanceof HTMLButtonElement && el.dataset.action === 'delete' &&
          el.closest('tbody')?.querySelectorAll('tr').length === 1;
        el.disabled = busy || store.busy || onlySubmode;
      });
  };
  const score = (vector: number[] | null): string => {
    const value = q<HTMLSelectElement>(root, '.keyword').value;
    const keyword = value === '' ? undefined : keywords[Number(value)];
    return keyword && vector && vector.length === keyword.vec.length ? cosine(keyword.vec, vector).toFixed(3) : '—';
  };
  const draw = () => {
    if (!state || disposed) return;
    const { data } = state;
    q(root, '.model').textContent = `${data.embedding_model.name} · ${data.embedding_model.dimensions} dimensions`;
    list.innerHTML = Object.entries(data.modes).map(([name, mode], mi) => {
      const issue = modeIssue(name, mode, data.embedding_model.dimensions);
      const needsEmbedding = mode.submodes.some((s) => s.weight > 0 && submodeIssue(name, s, data.embedding_model.dimensions));
      const total = mode.submodes.reduce((sum, s) => sum + s.weight, 0);
      const validTotal = Number.isFinite(total) && total > 0;
      const status = !validTotal ? 'Invalid weights' : needsEmbedding ? 'Needs embedding' : issue ? 'Needs recalculation' : 'Ready';
      const preview = validTotal && !needsEmbedding ? averageMode(name, mode, data.embedding_model.dimensions) : null;
      const savedMode = savedData?.modes[name];
      const savedVector = savedMode && !modeIssue(name, savedMode, data.embedding_model.dimensions) ? savedMode.vector : null;
      return `<details data-mode="${mi}" ${expanded.has(name) ? 'open' : ''}>
        <summary><b>${esc(name)}</b> · <span class="mode-status">${status}</span> · ${mode.submodes.length} submodes · Saved score: ${score(savedVector)} · Preview score: ${score(preview)}</summary>
        <label class="mode-description">Description <textarea rows="1" data-field="description" aria-label="${esc(name)} description">${esc(mode.description)}</textarea></label>
        ${issue ? `<p class="hint">${esc(issue)}</p>` : ''}
        <table class="mini mode-submodes"><colgroup><col class="enabled-col" /><col /><col class="weight-col" /><col class="contribution-col" /><col class="embedding-col" /><col class="score-col" /><col class="delete-col" /></colgroup><thead><tr><th>Enabled</th><th>Text</th><th>Weight</th><th>Contribution</th><th>Embedding</th><th>Keyword score</th><th></th></tr></thead>
        <tbody>${mode.submodes.map((s, i) => {
          const subIssue = submodeIssue(name, s, data.embedding_model.dimensions);
          return `<tr data-submode="${i}">
            <td><input type="checkbox" data-field="enabled" aria-label="Enable ${esc(name)} submode ${i + 1}" ${s.weight > 0 ? 'checked' : ''} /></td>
            <td><textarea rows="1" data-field="text" aria-label="${esc(name)} submode ${i + 1} text">${esc(s.text)}</textarea></td>
            <td><input type="number" min="0" step="0.1" data-field="weight" aria-label="${esc(name)} submode ${i + 1} weight" value="${s.weight}" /></td>
            <td class="contribution">${total > 0 ? (100 * s.weight / total).toFixed(1) : '0.0'}%</td>
            <td title="${esc(subIssue ?? 'Embedding matches its text')}">${subIssue ? 'Needs embedding' : 'Ready'}</td>
            <td>${score(subIssue ? null : s.vector)}</td>
            <td><button class="danger" data-action="delete" ${mode.submodes.length <= 1 ? 'disabled' : ''}>Delete</button></td>
          </tr>`;
        }).join('')}</tbody></table>
        <button data-action="add">Add submode</button>
      </details>`;
    }).join('');
    list.querySelectorAll<HTMLDetailsElement>('details').forEach((detail) => detail.addEventListener('toggle', () => {
      const name = Object.keys(data.modes)[Number(detail.dataset.mode)];
      if (detail.open) expanded.add(name); else expanded.delete(name);
      if (detail.open) resizeTextareas(detail);
    }));
    list.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(resizeTextareas);
    controls();
  };
  const resizeTextareas = (container: ParentNode) => {
    container.querySelectorAll<HTMLTextAreaElement>('textarea').forEach((textarea) => {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight + 2}px`;
    });
  };
  list.addEventListener('input', (event) => {
    if (event.target instanceof HTMLTextAreaElement) resizeTextareas(event.target.parentElement!);
  });
  const resize = () => list.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(resizeTextareas);
  window.addEventListener('resize', resize);
  const load = async () => {
    await store.refreshModes();
  };
  const action = async (work: () => Promise<void>) => {
    busy = true;
    controls();
    try { await store.runExclusive(work); }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!disposed) report(message, true);
      else alert(message);
    }
    finally { busy = false; if (!disposed) controls(); }
  };
  const persist = async () => {
    if (!state) return;
    const response = await request<EditorResponse>('/api/modes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    parseInterestModes(response.data);
    await load();
    if (!disposed) report('Mode averages recalculated offline.');
  };
  const edit = (event: Event) => {
    if (!state || busy || store.busy || !(event.target instanceof HTMLElement)) return;
    const target = event.target;
    if (event.type === 'input' && !(target instanceof HTMLTextAreaElement)) return;
    const detail = target.closest<HTMLDetailsElement>('details');
    if (!detail) return;
    const name = Object.keys(state.data.modes)[Number(detail.dataset.mode)];
    const mode = state.data.modes[name];
    const row = target.closest<HTMLTableRowElement>('tr[data-submode]');
    if (target instanceof HTMLTextAreaElement && target.dataset.field === 'description') mode.description = target.value;
    else if (row) {
      const submode = mode.submodes[Number(row.dataset.submode)];
      if (target instanceof HTMLTextAreaElement && target.dataset.field === 'text') {
        if (submode.text !== target.value) {
          submode.text = target.value;
          submode.vector = null;
          submode.embeddedText = null;
          mode.vector = null;
        }
      } else if (target instanceof HTMLInputElement && target.dataset.field === 'weight') {
        if (!Number.isFinite(target.valueAsNumber) || target.valueAsNumber < 0) {
          report('Weights must be finite and nonnegative.', true);
          draw();
          return;
        }
        submode.weight = target.valueAsNumber;
        mode.vector = null;
      } else if (target instanceof HTMLInputElement && target.dataset.field === 'enabled') {
        if (!target.checked) { disabledWeights.set(submode, submode.weight); submode.weight = 0; }
        else submode.weight = disabledWeights.get(submode) ?? 1;
        mode.vector = null;
      } else return;
    } else return;
    store.touchModes();
    expanded.add(name);
    report(store.areModesDirty ? 'Unsaved mode edits.' : '');
    if (event.type === 'change') draw();
    else resize();
  };
  list.addEventListener('change', edit);
  list.addEventListener('input', edit);
  list.addEventListener('click', (event) => {
    if (!state || busy || store.busy || !(event.target instanceof HTMLButtonElement)) return;
    const target = event.target;
    const detail = target.closest<HTMLDetailsElement>('details');
    if (!detail) return;
    const name = Object.keys(state.data.modes)[Number(detail.dataset.mode)];
    const mode = state.data.modes[name];
    if (target.dataset.action === 'add') {
      mode.submodes.push({ text: '', weight: 1, vector: null, embeddedText: null });
    } else if (target.dataset.action === 'delete') {
      const row = target.closest<HTMLTableRowElement>('tr[data-submode]');
      if (!row || mode.submodes.length <= 1 || !confirm('Delete this submode?')) return;
      mode.submodes.splice(Number(row.dataset.submode), 1);
    } else return;
    mode.vector = null;
    store.touchModes();
    expanded.add(name);
    report('Unsaved mode edits.');
    draw();
  });
  q(root, '.keyword').addEventListener('change', draw);
  button('.calculate').addEventListener('click', () => void action(persist));
  button('.refresh').addEventListener('click', () => {
    if (!state || !confirm('Refresh embeddings and calculate mode averages? Uncached texts require internet/Azure. Existing preference and kind embeddings are also verified.')) return;
    const dimensions = state.data.embedding_model.dimensions;
    void action(async () => {
      await request('/api/embeddings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimensions, force: false, dryRun: false }),
      });
      while (true) {
        const job = await request<{ status: string; log: string[] }>('/api/embeddings');
        if (!disposed) report(job.log.at(-1) ?? 'Refreshing embeddings...');
        if (job.status === 'failed') throw new Error(job.log.at(-1) ?? 'Embedding refresh failed.');
        if (job.status === 'succeeded') {
          await store.refreshAfterEmbeddings();
          if (!disposed) report('Embeddings refreshed and mode averages recalculated offline.');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    });
  });
  const modesChanged = () => {
    state = store.modes;
    savedData = store.savedModes;
    if (!disposed) { draw(); report(''); }
  };
  store.addEventListener('modes', modesChanged);
  store.addEventListener('dirty', controls);
  draw();
  report('');
  return () => {
    disposed = true;
    root.classList.remove('modes-page');
    store.removeEventListener('modes', modesChanged);
    store.removeEventListener('dirty', controls);
    window.removeEventListener('resize', resize);
  };
}
