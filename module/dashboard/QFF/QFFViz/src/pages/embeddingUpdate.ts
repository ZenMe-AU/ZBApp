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
      (created by <code>QFF/infra</code> Terraform). Kind descriptions come from <code>QFF/embedding-kinds.json</code>. Uses your <code>az login</code> identity; results are cached so unchanged keywords are not re-billed.</p>
    <div class="toolbar">
      <label>Dimensions <input class="dims" type="number" min="16" max="1536" step="16" value="256" style="width:80px" /></label>
      <label title="List what would be embedded and the estimated cost without calling the API"><input type="checkbox" class="dry" /> Dry run</label>
      <label title="Ignore the cache and re-embed every text"><input type="checkbox" class="force" /> Ignore cache</label>
      <button class="run primary">Run</button>
      <span class="status"></span>
    </div>
    <div class="split" style="grid-template-columns: minmax(0, 1fr) minmax(300px, 40%)">
      <pre class="log scroll" style="margin:0;padding:8px;background:#1f2933;color:#e6eaee;font-size:12px;border-radius:4px"></pre>
      <aside class="panel"><h3>Current vectors</h3><div class="g"></div></aside>
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
    else if (finished && job.status === 'succeeded' && !job.options.dryRun) await store.load();
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

  return () => {
    window.clearTimeout(timer);
    grid.destroy();
  };
}
