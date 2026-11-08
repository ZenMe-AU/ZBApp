import { createJSONEditor, Mode, type Content, type OnChangeStatus } from 'vanilla-jsoneditor';
import { store } from '../data/store';
import type { DataFile } from '../data/types';
import { esc, q } from '../shared/dom';

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <h2>Raw JSON files</h2>
    <p class="hint">Every JSON file under <code>Identities/</code>, editable as tree, table or text. Invalid JSON is not applied.</p>
    <div class="split" style="grid-template-columns: 280px 1fr">
      <div class="list scroll"></div>
      <div class="editor" style="height:100%"></div>
    </div>`;

  const list = q(root, '.list');
  let current: DataFile | undefined;

  const drawList = () => {
    const folders = [...new Set(store.files.map((f) => f.folder))];
    list.innerHTML = folders
      .map(
        (folder) =>
          `<h3>${esc(folder)}</h3>` +
          store.files
            .filter((f) => f.folder === folder)
            .map(
              (f) =>
                `<button data-path="${esc(f.path)}" class="${f === current ? 'primary' : ''}">${store.isDirty(f) ? '● ' : ''}${esc(f.path.split('/')[1])}</button>`,
            )
            .join(''),
      )
      .join('');
  };

  const editor = createJSONEditor({
    target: q(root, '.editor'),
    props: {
      mode: Mode.tree,
      content: { json: {} },
      onChange: (updated: Content, _previous: Content, { contentErrors }: OnChangeStatus) => {
        if (!current || contentErrors) return;
        try {
          store.replaceContent(current, 'json' in updated ? updated.json : JSON.parse(updated.text));
        } catch {
          // Incomplete text-mode edits stay in the editor until they parse.
        }
      },
    },
  });

  list.addEventListener('click', (e) => {
    const path = (e.target as HTMLElement).closest('button')?.dataset.path;
    current = store.files.find((f) => f.path === path);
    if (!current) return;
    editor.set({ json: current.content });
    drawList();
  });

  store.addEventListener('dirty', drawList);
  drawList();

  return () => {
    store.removeEventListener('dirty', drawList);
    editor.destroy();
  };
}
