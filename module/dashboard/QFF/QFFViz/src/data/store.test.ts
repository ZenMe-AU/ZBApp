import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from './store.ts';
import { jsonChanges, changeValue } from '../shared/changes.ts';

function fixture() {
  return {
    revision: 'revision-1',
    data: {
      embedding_model: { name: 'test', version: '1', dimensions: 2 },
      modes: { discuss: {
        description: 'Discuss',
        vector: [1, 0],
        submodes: [{ text: 'discuss', weight: 1, vector: [1, 0], embeddedText: 'discuss: discuss' }],
      } },
    },
  };
}

function server(t: TestContext) {
  let modes = fixture();
  const files = [{ path: 'test/identity.json', content: { name: 'Test' } }];
  let failPath = '';
  const writes: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      writes.push(url);
      if (failPath && url.includes(failPath)) return Response.json({ error: 'Conflict' }, { status: 409 });
      if (url === '/api/modes') {
        modes = JSON.parse(String(init.body));
        modes.revision = 'revision-2';
        return Response.json(modes);
      }
      files[0].content = JSON.parse(String(init.body));
      return new Response(null, { status: 204 });
    }
    return Response.json(url === '/api/modes' ? modes : files);
  });
  return { writes, fail: (path: string) => { failPath = path; } };
}

test('global drafts, review, save and reload cover modes and identity files', async (t) => {
  const api = server(t);
  const store = new Store();
  await store.load();
  store.modes!.data.modes.discuss.description = 'Edited mode';
  store.touchModes();
  store.replaceContent(store.files[0], { name: 'Edited identity' });
  assert.equal(store.dirtyCount, 2);
  assert.deepEqual(store.unsavedChanges.map((f) => f.path), ['Identities/test/identity.json', 'interest-modes.json']);
  assert.deepEqual(store.unsavedChanges[1].changes, [{
    path: '$.modes.discuss.description', before: 'Discuss', after: 'Edited mode',
  }]);
  await store.save();
  assert.equal(api.writes.length, 2);
  assert.equal(store.dirtyCount, 0);
  assert.deepEqual(store.unsavedChanges, []);
  assert.equal(store.modes!.revision, 'revision-2');
  store.modes!.data.modes.discuss.description = 'Discard me';
  store.touchModes();
  store.replaceContent(store.files[0], { name: 'Discard me' });
  await store.load();
  assert.equal(store.modes!.data.modes.discuss.description, 'Edited mode');
  assert.deepEqual(store.files[0].content, { name: 'Edited identity' });
  assert.equal(store.dirtyCount, 0);
});

test('reverting edits removes them from the review', async (t) => {
  server(t);
  const store = new Store();
  await store.load();
  store.replaceContent(store.files[0], { name: 'Other' });
  store.replaceContent(store.files[0], { name: 'Test' });
  store.modes!.data.modes.discuss.description = 'Other';
  store.touchModes();
  store.modes!.data.modes.discuss.description = 'Discuss';
  store.touchModes();
  assert.equal(store.dirtyCount, 0);
});

test('revision conflict preserves mode drafts and does not report successful save', async (t) => {
  const api = server(t);
  const store = new Store();
  await store.load();
  store.modes!.data.modes.discuss.description = 'Pending';
  store.touchModes();
  api.fail('/api/modes');
  await assert.rejects(store.save(), /Conflict/);
  assert.equal(store.dirtyCount, 1);
  assert.equal(store.busy, false);
  assert.equal(store.unsavedChanges[0].changes[0].before, 'Discuss');
});

test('partial saves keep failed files dirty and notify listeners', async (t) => {
  const api = server(t);
  const store = new Store();
  await store.load();
  store.modes!.data.modes.discuss.description = 'Saved';
  store.touchModes();
  store.replaceContent(store.files[0], { name: 'Pending' });
  api.fail('/api/files');
  let count = -1;
  store.addEventListener('dirty', () => { count = store.dirtyCount; });
  await assert.rejects(store.save(), /Failed to save/);
  assert.equal(count, 1);
  assert.equal(store.areModesDirty, false);
  assert.equal(store.unsavedChanges[0].path, 'Identities/test/identity.json');
});

test('failed reload preserves drafts and saved baselines', async (t) => {
  server(t);
  const store = new Store();
  await store.load();
  store.modes!.data.modes.discuss.description = 'Pending';
  store.touchModes();
  t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status: 500 }));
  await assert.rejects(store.load(), /Failed to load/);
  assert.equal(store.dirtyCount, 1);
  assert.equal(store.modes!.data.modes.discuss.description, 'Pending');
});

test('edits made during a save remain pending with an updated baseline', async (t) => {
  server(t);
  const store = new Store();
  await store.load();
  store.modes!.data.modes.discuss.description = 'Saved snapshot';
  store.touchModes();
  let release!: (response: Response) => void;
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>((resolve) => { release = resolve; }));
  const saving = store.save();
  assert.equal(store.busy, true);
  await assert.rejects(store.save(), /Wait for/);
  store.modes!.data.modes.discuss.description = 'New draft';
  store.touchModes();
  const response = fixture();
  response.data.modes.discuss.description = 'Saved snapshot';
  response.revision = 'new-revision';
  release(Response.json(response));
  await saving;
  assert.equal(store.dirtyCount, 1);
  assert.equal(store.modes!.revision, 'new-revision');
  assert.equal(store.unsavedChanges[0].changes[0].before, 'Saved snapshot');
  assert.equal(store.unsavedChanges[0].changes[0].after, 'New draft');
});

test('identity edits made during save are not marked as saved', async (t) => {
  server(t);
  const store = new Store();
  await store.load();
  store.replaceContent(store.files[0], { name: 'Saved snapshot' });
  let release!: (response: Response) => void;
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>((resolve) => { release = resolve; }));
  const saving = store.save();
  store.replaceContent(store.files[0], { name: 'New draft' });
  release(new Response(null, { status: 204 }));
  await saving;
  assert.equal(store.dirtyCount, 1);
  assert.deepEqual(store.unsavedChanges[0].changes, [{
    path: '$.name', before: 'Saved snapshot', after: 'New draft',
  }]);
});

test('a failed modes reload cannot replace identity drafts', async (t) => {
  server(t);
  const store = new Store();
  await store.load();
  store.replaceContent(store.files[0], { name: 'Pending' });
  t.mock.method(globalThis, 'fetch', async (url: string) => url === '/api/modes'
    ? Response.json({ error: 'Modes unavailable' }, { status: 503 })
    : Response.json([{ path: 'test/identity.json', content: { name: 'Fresh disk data' } }]));
  await assert.rejects(store.load(), /Modes unavailable/);
  assert.deepEqual(store.files[0].content, { name: 'Pending' });
  assert.equal(store.unsavedChanges[0].changes[0].before, 'Test');
});

test('mode refresh updates vectors without discarding identity drafts', async (t) => {
  server(t);
  const store = new Store();
  await store.load();
  store.replaceContent(store.files[0], { name: 'Pending' });
  await store.refreshModes();
  assert.equal(store.dirtyCount, 1);
  store.modes!.data.modes.discuss.description = 'Pending mode';
  store.touchModes();
  await assert.rejects(store.refreshModes(), /Save or reload/);
});

test('embedding refresh reloads all persisted data, but never discards pending drafts', async (t) => {
  server(t);
  const store = new Store();
  await store.load();
  const modes = fixture();
  modes.data.modes.discuss.vector = [0, 1];
  t.mock.method(globalThis, 'fetch', async (url: string) => Response.json(
    url === '/api/modes' ? modes : [{ path: 'test/identity.json', content: { name: 'Refreshed' } }],
  ));
  await store.runExclusive(() => store.refreshAfterEmbeddings());
  assert.deepEqual(store.modes!.data.modes.discuss.vector, [0, 1]);
  assert.deepEqual(store.files[0].content, { name: 'Refreshed' });
  store.replaceContent(store.files[0], { name: 'Pending' });
  await assert.rejects(store.refreshAfterEmbeddings(), /drafts are pending/);
  assert.equal(store.dirtyCount, 1);
});

test('change review handles additions, deletions, arrays and vector invalidation', () => {
  const changes = jsonChanges({ list: ['a', 'b'], vector: Array(1536).fill(1) }, { list: ['a'], vector: null, added: 0 });
  assert.deepEqual(changes.map((c) => c.path), ['$.list[1]', '$.vector', '$.added']);
  assert.equal(changeValue(changes[0].after), '(absent)');
  assert.equal(changeValue(changes[1].before), '[numeric vector: 1536 values]');
  assert.equal(changeValue(changes[1].after), 'null');
  assert.equal(changeValue(changes[2].after), '0');
});
