import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { store } from './data/store';
import { esc, initInfoDialog, openInfo, q } from './shared/dom';
import './styles.css';

import * as identitiesGrid from './pages/identitiesGrid';
import * as personasGrid from './pages/personasGrid';
import * as preferencesGrid from './pages/preferencesGrid';
import * as relationsGrid from './pages/relationsGrid';
import * as affinityMatrix from './pages/affinityMatrix';
import * as embeddingsGrid from './pages/embeddingsGrid';
import * as profileEditor from './pages/profileEditor';
import * as rawJson from './pages/rawJson';
import * as relationNetwork from './pages/relationNetwork';
import * as topicNetwork from './pages/topicNetwork';
import * as personaNetwork from './pages/personaNetwork';
import * as similarityNetwork from './pages/similarityNetwork';
import * as vennEuler from './pages/vennEuler';
import * as vennClassic from './pages/vennClassic';
import * as upset from './pages/upset';
import * as pairVenn from './pages/pairVenn';
import * as embeddingUpdate from './pages/embeddingUpdate';
import * as embeddingDistribution from './pages/embeddingDistribution';
import * as embeddingMap from './pages/embeddingMap';
import * as embeddingMap3d from './pages/embeddingMap3d';
import * as matchPreview from './pages/matchPreview';
import * as modeHeatmap from './pages/modeHeatmap';
import * as contrastAxes from './pages/contrastAxes';
import * as modeComparison from './pages/modeComparison';
import * as modesEdit from './pages/modesEdit';
import * as modeVectors from './pages/modeVectors';
import { changeValue } from './shared/changes';

ModuleRegistry.registerModules([AllCommunityModule]);
initInfoDialog();

interface Page {
  id: string;
  group: string;
  title: string;
  info: string;
  render: (root: HTMLElement) => () => void;
}

const pages: Page[] = [
  { id: 'identities', group: 'Grids', title: 'Identities', render: identitiesGrid.render,
    info: 'The core profile of each person (*-identity.json): name, age, location, occupation and a free-text summary. Every other file links back to these IDs.' },
  { id: 'personas', group: 'Grids', title: 'Personas', render: personasGrid.render,
    info: 'The connection personas each person offers (*-personas.json): what kind of connection they seek, what they contribute and expect, and their boundaries and disclosure rules. Matching is done per persona.' },
  { id: 'preferences', group: 'Grids', title: 'Preferences', render: preferencesGrid.render,
    info: 'The machine-readable preferences behind each persona (*-properties.json): keyword, kind (interest, value, boundary) and signed affinity from -1 (repels) to +1 (attracts). These drive the matcher.' },
  { id: 'relations', group: 'Grids', title: 'Relations', render: relationsGrid.render,
    info: 'Who already knows whom (*-relations.json), which topics each person discusses with that contact, and which they keep private. Shows whether a relation is reciprocal.' },
  { id: 'matrix', group: 'Grids', title: 'Affinity matrix', render: affinityMatrix.render,
    info: 'Compare preferences across everyone at once: rows are keywords (per kind), columns are identity → persona, cells are affinity. Type a value to add a preference, clear a cell to remove it.' },
  { id: 'profile', group: 'Forms', title: 'Profile editor', render: profileEditor.render,
    info: 'Everything about one person on a single page: identity, personas side by side, preferences and relations. Useful for reviewing or authoring a complete profile.' },
  { id: 'raw', group: 'Forms', title: 'Raw JSON files', render: rawJson.render,
    info: 'Direct tree/table/text editing of every JSON file under Identities/, including fields no other page exposes (embedding_model, kind_vectors). Invalid JSON is never applied.' },
  { id: 'relation-network', group: 'Networks', title: 'Relationships', render: relationNetwork.render,
    info: 'The social graph: arrows show declared relations labelled with shared topics; green = reciprocal, orange = one-way. Click to edit, Shift+click to create a relation.' },
  { id: 'topic-network', group: 'Networks', title: 'Identity ↔ topic', render: topicNetwork.render,
    info: 'Which people connect through which topics or preferences. Topics shared by many identities sit in the middle. Click a topic to rename or remove it everywhere.' },
  { id: 'persona-network', group: 'Networks', title: 'Persona ↔ preference', render: personaNetwork.render,
    info: 'How each person’s personas are built from preferences, and which keywords several people share. Edge colour = kind, width = affinity strength.' },
  { id: 'similarity-network', group: 'Networks', title: 'Persona similarity', render: similarityNetwork.render,
    info: 'Rough persona-to-persona closeness across identities using the affinity-weighted average of preference embeddings. An exploration aid, not the matcher.' },
  { id: 'venn-euler', group: 'Sets', title: 'Venn (area-proportional)', render: vennEuler.render,
    info: 'Overlap of 2–4 people’s preferences or topics where circle and overlap areas reflect set sizes. Good for seeing how much common ground exists.' },
  { id: 'venn-classic', group: 'Sets', title: 'Venn (classic)', render: vennClassic.render,
    info: 'Fixed-shape Venn for up to 5 people: every overlap region is shown even when small or empty, so you can read exact shared items.' },
  { id: 'upset', group: 'Sets', title: 'UpSet (all identities)', render: upset.render,
    info: 'Shared items across all identities at once. Each bar counts items held by exactly the dotted combination of people; scales beyond what a Venn can show.' },
  { id: 'pair-venn', group: 'Sets', title: 'Relationship pair', render: pairVenn.render,
    info: 'Checks whether the topics two people declared as shared in their relation are actually backed by both people’s preferences, and lets you edit the relation.' },
  { id: 'modes-edit', group: 'Modes', title: 'Edit', render: modesEdit.render,
    info: 'Edit modes and weighted submodes, compare their scores for a keyword, refresh embeddings online, and recalculate mode averages offline.' },
  { id: 'mode-3d', group: 'Modes', title: '3D', render: modeVectors.render3d,
    info: 'Inspect modes and submodes in 3D with UMAP/PCA/t-SNE and control mode/submode visibility.' },
  { id: 'mode-3d-echarts', group: 'Modes', title: '3DE', render: modeVectors.render3dE,
    info: 'Apache ECharts GL version of the 3D modes and submodes view.' },
  { id: 'modes-heatmap', group: 'Modes', title: 'Heatmap', render: modeVectors.renderHeatmap,
    info: 'Compare submodes with mode averages using full-dimensional cosine and leave-one-out sibling alignment.' },
  { id: 'embedding-update', group: 'Embeddings', title: 'Update', render: embeddingUpdate.render,
    info: 'Regenerates all preference and kind embeddings with the Azure AI Foundry deployment, with a dry-run cost estimate and a live run log. Run after editing keywords or kind descriptions.' },
  { id: 'embeddings', group: 'Embeddings', title: 'Heatmap', render: embeddingsGrid.render,
    info: 'The raw embedding numbers for every preference and kind vector. Useful for spotting missing or odd vectors; values are editable but normally regenerated, not hand-edited.' },
  { id: 'embedding-distribution', group: 'Embeddings', title: 'Similarity distribution', render: embeddingDistribution.render,
    info: 'Histogram of similarity between every keyword pair (green = same kind, grey = mixed). Use it to choose a concept cut-off: review the pairs listed just above and below the line.' },
  { id: 'embedding-map', group: 'Embeddings', title: 'Keyword map', render: embeddingMap.render,
    info: 'Keywords placed in 2D by the main directions of their embeddings, coloured by kind, with lines joining pairs above the cut-off. Click a keyword to list its nearest neighbours.' },
  { id: 'embedding-map-3d', group: 'Embeddings', title: 'Keyword map 3D', render: embeddingMap3d.render,
    info: 'Interactive 3D view of the keyword embeddings with PCA/UMAP projections and several colour schemes.' },
  { id: 'match-preview', group: 'Embeddings', title: 'Match preview', render: matchPreview.render,
    info: 'Runs the matching.md scoring between two identities with adjustable concept and kind cut-offs, showing persona-pair scores and the evidence behind them. Developer view only: it reveals both sides’ preferences, which real match files must never do.' },
  { id: 'mode-heatmap', group: 'Preferences', title: 'Keyword × mode', render: modeHeatmap.render,
    info: 'How strongly each interest keyword points at each interest mode (participate, spectate, visit, …), with raw, relative and standardised scores.' },
  { id: 'contrast-axes', group: 'Preferences', title: 'Contrast axes', render: contrastAxes.render,
    info: 'Scatter of keywords on two mode-difference axes such as spectate − participate, which cancel shared topic and isolate how someone engages.' },
  { id: 'mode-comparison', group: 'Preferences', title: 'Method comparison', render: modeComparison.render,
    info: 'Checks each mode-scoring method against keywords whose leading verb states the mode, and whether contrast axes separate same-topic, different-mode pairs.' },
];

const menu = q(document, '#menu');
const pageRoot = q(document, '#page');
const status = q(document, '#status');
const staleLink = q<HTMLAnchorElement>(document, '#stale');
let cleanup: (() => void) | undefined;

/** Warns when the working set has preferences or used kinds without a vector (editing a keyword clears its vector). */
function refreshStale(): void {
  let count = 0;
  for (const p of store.people) {
    const used = new Set<string>();
    for (const pref of p.properties.personas.flatMap((g) => g.preferences)) {
      used.add(pref.kind);
      if (!pref.embedding?.length) count++;
    }
    used.forEach((k) => {
      if (!p.properties.kind_vectors?.[k]?.length) count++;
    });
  }
  staleLink.hidden = count === 0;
  staleLink.textContent = `⚠ ${count} stale embedding${count === 1 ? '' : 's'}`;
  staleLink.title = 'Some preferences or kinds have no current vector, so views ignore them. Click to open Embeddings → Update.';
}

menu.innerHTML = [...new Set(pages.map((p) => p.group))]
  .map(
    (group) =>
      `<h4>${esc(group)}</h4>` +
      pages.filter((p) => p.group === group).map((p) => `<a href="#${p.id}" data-id="${p.id}">${esc(p.title)}</a>`).join(''),
  )
  .join('');

function showPage(): void {
  if (location.hash === '#mode-vectors') history.replaceState(null, '', '#mode-3d');
  const page = pages.find((p) => p.id === location.hash.slice(1)) ?? pages[0];
  menu.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.id === page.id));
  cleanup?.();
  pageRoot.innerHTML = '';
  cleanup = page.render(pageRoot);
  // Pages with their own detailed help already render an .info-btn in the heading.
  const heading = pageRoot.querySelector('h2');
  if (heading && !heading.querySelector('.info-btn')) {
    const btn = document.createElement('button');
    btn.className = 'info-btn';
    btn.textContent = 'ⓘ';
    btn.title = btn.ariaLabel = 'What is this page for?';
    btn.addEventListener('click', () => openInfo(page.title, `<p>${esc(page.info)}</p>`));
    heading.append(' ', btn);
  }
}

store.addEventListener('dirty', () => {
  status.textContent = store.busy ? 'Working...' : store.dirtyCount ? `${store.dirtyCount} unsaved file(s)` : 'All changes saved';
  status.classList.toggle('dirty', store.dirtyCount > 0);
  refreshStale();
  q<HTMLButtonElement>(document, '#save').disabled = store.busy || store.dirtyCount === 0;
  q<HTMLButtonElement>(document, '#reload').disabled = store.busy;
  pageRoot.inert = store.busy;
  q<HTMLButtonElement>(document, '#view-unsaved').disabled = store.dirtyCount === 0;
  if (changesDialog.open) drawChanges();
});
store.addEventListener('loaded', showPage);
window.addEventListener('hashchange', showPage);
window.addEventListener('beforeunload', (e) => {
  if (store.dirtyCount || store.busy) e.preventDefault();
});

q(document, '#save').addEventListener('click', () => store.save().catch((err) => alert(err)));
q(document, '#reload').addEventListener('click', () => {
  if (!store.dirtyCount || confirm('Discard unsaved changes and reload from disk?')) store.load().catch((err) => alert(err));
});

const changesDialog = q<HTMLDialogElement>(document, '#changes-dialog');
function drawChanges(): void {
  q(changesDialog, '.body').innerHTML = store.unsavedChanges.length ? store.unsavedChanges.map((file) => `
    <details open><summary><b>${esc(file.path)}</b> · ${file.changes.length} changed field(s)</summary>
      <table class="mini"><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
      <tbody>${file.changes.map((change) => `<tr><td>${esc(change.path)}</td><td><pre>${esc(changeValue(change.before))}</pre></td><td><pre>${esc(changeValue(change.after))}</pre></td></tr>`).join('')}</tbody></table>
    </details>`).join('') : '<p>No unsaved changes.</p>';
}
q(document, '#view-unsaved').addEventListener('click', () => {
  drawChanges();
  changesDialog.showModal();
});

store.load().catch((err) => {
  pageRoot.textContent = String(err);
});
