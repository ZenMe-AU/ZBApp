import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { store } from './data/store';
import { esc, q } from './shared/dom';
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
import * as matchPreview from './pages/matchPreview';

ModuleRegistry.registerModules([AllCommunityModule]);

interface Page {
  id: string;
  group: string;
  title: string;
  render: (root: HTMLElement) => () => void;
}

const pages: Page[] = [
  { id: 'identities', group: 'Grids', title: 'Identities', render: identitiesGrid.render },
  { id: 'personas', group: 'Grids', title: 'Personas', render: personasGrid.render },
  { id: 'preferences', group: 'Grids', title: 'Preferences', render: preferencesGrid.render },
  { id: 'relations', group: 'Grids', title: 'Relations', render: relationsGrid.render },
  { id: 'matrix', group: 'Grids', title: 'Affinity matrix', render: affinityMatrix.render },
  { id: 'profile', group: 'Forms', title: 'Profile editor', render: profileEditor.render },
  { id: 'raw', group: 'Forms', title: 'Raw JSON files', render: rawJson.render },
  { id: 'relation-network', group: 'Networks', title: 'Relationships', render: relationNetwork.render },
  { id: 'topic-network', group: 'Networks', title: 'Identity ↔ topic', render: topicNetwork.render },
  { id: 'persona-network', group: 'Networks', title: 'Persona ↔ preference', render: personaNetwork.render },
  { id: 'similarity-network', group: 'Networks', title: 'Persona similarity', render: similarityNetwork.render },
  { id: 'venn-euler', group: 'Sets', title: 'Venn (area-proportional)', render: vennEuler.render },
  { id: 'venn-classic', group: 'Sets', title: 'Venn (classic)', render: vennClassic.render },
  { id: 'upset', group: 'Sets', title: 'UpSet (all identities)', render: upset.render },
  { id: 'pair-venn', group: 'Sets', title: 'Relationship pair', render: pairVenn.render },
  { id: 'embedding-update', group: 'Embeddings', title: 'Update', render: embeddingUpdate.render },
  { id: 'embeddings', group: 'Embeddings', title: 'Heatmap', render: embeddingsGrid.render },
  { id: 'embedding-distribution', group: 'Embeddings', title: 'Similarity distribution', render: embeddingDistribution.render },
  { id: 'embedding-map', group: 'Embeddings', title: 'Keyword map', render: embeddingMap.render },
  { id: 'match-preview', group: 'Embeddings', title: 'Match preview', render: matchPreview.render },
];

const menu = q(document, '#menu');
const pageRoot = q(document, '#page');
const status = q(document, '#status');
let cleanup: (() => void) | undefined;

menu.innerHTML = [...new Set(pages.map((p) => p.group))]
  .map(
    (group) =>
      `<h4>${esc(group)}</h4>` +
      pages.filter((p) => p.group === group).map((p) => `<a href="#${p.id}" data-id="${p.id}">${esc(p.title)}</a>`).join(''),
  )
  .join('');

function showPage(): void {
  const page = pages.find((p) => p.id === location.hash.slice(1)) ?? pages[0];
  menu.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.id === page.id));
  cleanup?.();
  pageRoot.innerHTML = '';
  cleanup = page.render(pageRoot);
}

store.addEventListener('dirty', () => {
  status.textContent = store.dirtyCount ? `${store.dirtyCount} unsaved file(s)` : 'All changes saved';
  status.classList.toggle('dirty', store.dirtyCount > 0);
});
store.addEventListener('loaded', showPage);
window.addEventListener('hashchange', showPage);
window.addEventListener('beforeunload', (e) => {
  if (store.dirtyCount) e.preventDefault();
});

q(document, '#save').addEventListener('click', () => store.save().catch((err) => alert(err)));
q(document, '#reload').addEventListener('click', () => {
  if (!store.dirtyCount || confirm('Discard unsaved changes and reload from disk?')) store.load().catch((err) => alert(err));
});

store.load().catch((err) => {
  pageRoot.textContent = String(err);
});
