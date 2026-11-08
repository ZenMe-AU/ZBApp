import { createGrid } from 'ag-grid-community';
import { store } from '../data/store';
import { esc, q } from '../shared/dom';

interface Job {
  status: 'idle' | 'running' | 'succeeded' | 'failed';
  startedAt: string;
  finishedAt: string;
  options: { dimensions?: number; force?: boolean; dryRun?: boolean };
  log: string[];
}

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <h2>Update embeddings</h2>
    <p class="hint">Regenerates every preference and kind vector in <code>*-properties.json</code> with the Azure AI Foundry deployment in <code>embedding.config.json</code>
      (created by <code>QFF/infra</code> Terraform). Kind descriptions come from <code>QFF/embedding-kinds.json</code> and interest submode texts from <code>QFF/interest-modes.json</code>. Submodes are embedded using only their exact text, without a parent mode prefix. Uses your <code>az login</code> identity; results are cached so unchanged keywords are not re-billed. Successful refreshes automatically calculate mode averages offline.</p>
    <div class="toolbar">
      <label>Dimensions <input class="dims" type="number" min="16" max="1536" step="16" value="1536" style="width:80px" /></label>
      <label title="List what would be embedded and the estimated cost without calling the API"><input type="checkbox" class="dry" /> Dry run</label>
      <label title="Ignore the cache and re-embed every text"><input type="checkbox" class="force" /> Ignore cache</label>
      <button class="run primary">Run</button>
      <span class="status"></span>
    </div>
    <div class="split" style="grid-template-columns: minmax(0, 1fr) minmax(300px, 40%)">
      <pre class="log scroll" style="margin:0;padding:8px;background:#1f2933;color:#e6eaee;font-size:12px;border-radius:4px"></pre>
      <aside class="panel"><h3>Current vectors</h3><div class="g"></div>
        <h3>Stale vectors <button class="clear danger" title="Set stale preference embeddings to null and remove stale kind vectors so no view uses them">Clear stale</button></h3>
        <p class="hint stale-summary"></p><div class="sg"></div></aside>
    </div>`;

  const status = q(root, '.status');
  const logEl = q(root, '.log');
  const runBtn = q<HTMLButtonElement>(root, '.run');

  const grid = createGrid(q(root, '.g'), {
    domLayout: 'autoHeight',
    defaultColDef: { flex: 1 },
    rowData: store.people.map((p) => {
      const prefs = p.properties.personas.flatMap((g) => g.preferences);
      return {
        identity: p.identity.name,
        model: p.properties.embedding_model.name,
        dims: p.properties.embedding_model.dimensions,
        prefs: `${prefs.filter((x) => x.embedding?.length).length}/${prefs.length}`,
      };
    }),
    columnDefs: [
      { field: 'identity' },
      { field: 'model', flex: 2 },
      { field: 'dims', maxWidth: 80 },
      { field: 'prefs', headerName: 'Embedded', maxWidth: 100 },
    ],
  });

  let timer: number | undefined;
  let lastStatus = '';
  const reloadRefreshed = async () => {
    try { await store.runExclusive(() => store.refreshAfterEmbeddings()); }
    catch (err) { alert(err instanceof Error ? err.message : String(err)); }
  };

  const staleGrid = createGrid<{ item: string; where: string; reason: string }>(q(root, '.sg'), {
    rowData: [],
    domLayout: 'autoHeight',
    defaultColDef: { flex: 1, wrapText: true, autoHeight: true, filter: true },
    columnDefs: [{ field: 'item', flex: 2 }, { field: 'where', flex: 2 }, { field: 'reason', flex: 2 }],
  });
  const loadStale = async () => {
    const s = (await (await fetch('/api/embeddings/status')).json()) as {
      error?: string;
      stale: { path: string; persona: string; keyword: string; reason: string }[];
      staleKinds: { path: string; kind: string; reason: string }[];
      staleModes: { mode: string; reason: string }[];
    };
    if (s.error) {
      q(root, '.stale-summary').textContent = s.error;
      return;
    }
    const rows = [
      ...s.stale.map((x) => ({ item: x.keyword, where: `${x.path.split('/')[0]} · ${x.persona}`, reason: x.reason })),
      ...s.staleKinds.map((x) => ({ item: `kind: ${x.kind}`, where: x.path.split('/')[0], reason: x.reason })),
      ...s.staleModes.map((x) => ({ item: `interest mode: ${x.mode}`, where: 'interest-modes.json', reason: x.reason })),
    ];
    q(root, '.stale-summary').textContent = rows.length
      ? `${rows.length} vector(s) are missing or stale. Refresh embeddings for changed texts; run calculate-mode-vectors for stale mode averages. Views ignore missing or stale modes.`
      : 'All vectors match their current text.';
    staleGrid.setGridOption('rowData', rows);
  };

  q(root, '.clear').addEventListener('click', async () => {
    if (store.dirtyCount > 0) return alert('Save or reload unsaved edits first.');
    const res = await fetch('/api/embeddings/clear-stale', { method: 'POST' });
    const body = (await res.json()) as { cleared?: number; error?: string };
    if (!res.ok) return alert(body.error);
    await reloadRefreshed();
  });

  const show = (job: Job) => {
    logEl.textContent = job.log.join('\n') || 'No run yet in this dev-server session.';
    logEl.scrollTop = logEl.scrollHeight;
    status.innerHTML = `<b>${esc(job.status)}</b>${job.startedAt ? ` · started ${esc(new Date(job.startedAt).toLocaleTimeString())}` : ''}`;
    runBtn.disabled = job.status === 'running' || store.dirtyCount > 0;
    runBtn.title = store.dirtyCount > 0 ? 'Save or reload unsaved edits first; the run rewrites properties files.' : '';
  };

  const poll = async () => {
    const job = (await (await fetch('/api/embeddings')).json()) as Job;
    show(job);
    const finished = lastStatus === 'running' && job.status !== 'running';
    lastStatus = job.status;
    if (job.status === 'running') timer = window.setTimeout(poll, 1000);
    else if (finished && job.status === 'succeeded' && !job.options.dryRun) await reloadRefreshed();
  };

  runBtn.addEventListener('click', async () => {
    const res = await fetch('/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dimensions: Number(q<HTMLInputElement>(root, '.dims').value),
        dryRun: q<HTMLInputElement>(root, '.dry').checked,
        force: q<HTMLInputElement>(root, '.force').checked,
      }),
    });
    if (!res.ok) return alert((await res.json()).error);
    lastStatus = 'running';
    await poll();
  });

  poll();
  void loadStale();

  return () => {
    window.clearTimeout(timer);
    grid.destroy();
    staleGrid.destroy();
  };
}
