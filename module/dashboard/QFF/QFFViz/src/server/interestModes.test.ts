import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { applyModeEdits, averageMode, clearChangedSubmodes, modeIssue, parseInterestModes, submodeInput, type InterestModesFile } from '../../../interest-modes.ts';

function fixture(): InterestModesFile {
  return parseInterestModes({
    embedding_model: { name: 'test', version: '1', dimensions: 2 },
    modes: {
      discuss: {
        description: 'Discussion',
        vector: [0.25, 0.75],
        submodes: [
          { text: 'discuss', weight: 1, vector: [1, 0], embeddedText: 'discuss: discuss' },
          { text: 'sharing news', weight: 3, vector: [0, 1], embeddedText: 'discuss: sharing news' },
        ],
      },
    },
  });
}

test('weighted averaging, reordering, deletion and rescaling work offline', () => {
  const file = fixture();
  const mode = file.modes.discuss;
  assert.deepEqual(averageMode('discuss', mode, 2), [0.25, 0.75]);
  assert.equal(modeIssue('discuss', mode, 2), null);
  mode.submodes.reverse();
  mode.submodes.forEach((s) => s.weight *= 2);
  assert.deepEqual(averageMode('discuss', mode, 2), [0.25, 0.75]);
  mode.submodes.pop();
  assert.deepEqual(averageMode('discuss', mode, 2), [0, 1]);
  assert.match(modeIssue('discuss', mode, 2) ?? '', /average is stale/);
});

test('changed text clears its embedding and parent average, without affecting siblings', () => {
  const file = fixture();
  const mode = file.modes.discuss;
  mode.submodes[0].text = 'debating';
  assert.match(modeIssue('discuss', mode, 2) ?? '', /text changed/);
  assert.equal(clearChangedSubmodes(file), 2);
  assert.equal(mode.vector, null);
  assert.equal(mode.submodes[0].vector, null);
  assert.equal(mode.submodes[0].embeddedText, null);
  assert.deepEqual(mode.submodes[1].vector, [0, 1]);
  assert.throws(() => averageMode('discuss', mode, 2), /text changed/);
});

test('parent name changes invalidate prefixed inputs', () => {
  const mode = fixture().modes.discuss;
  assert.equal(submodeInput('discuss', mode.submodes[0]), 'discuss: discuss');
  assert.match(modeIssue('debate', mode, 2) ?? '', /text changed/);
});

test('missing or wrong-sized active vectors never produce partial averages', () => {
  const mode = fixture().modes.discuss;
  mode.submodes[0].vector = null;
  assert.throws(() => averageMode('discuss', mode, 2), /missing submode vector/);
  mode.submodes[0].vector = [1];
  assert.throws(() => averageMode('discuss', mode, 2), /dimensions differ/);
  mode.submodes[0].weight = 0;
  assert.deepEqual(averageMode('discuss', mode, 2), [0, 1]);
});

test('weight changes invalidate only the aggregate, not submode embeddings', () => {
  const file = fixture();
  const mode = file.modes.discuss;
  mode.submodes[0].weight = 3;
  assert.equal(clearChangedSubmodes(file), 0);
  assert.deepEqual(mode.submodes[0].vector, [1, 0]);
  assert.match(modeIssue('discuss', mode, 2) ?? '', /average is stale/);
  mode.vector = averageMode('discuss', mode, 2);
  assert.equal(modeIssue('discuss', mode, 2), null);
});

test('invalid weights, empty submodes and nonfinite vectors are rejected', () => {
  for (const weight of [-1, NaN, Infinity]) {
    const file = fixture();
    file.modes.discuss.submodes[0].weight = weight;
    assert.throws(() => parseInterestModes(file), /Invalid submode/);
  }
  const file = fixture();
  file.modes.discuss.submodes.forEach((s) => s.weight = 0);
  assert.throws(() => parseInterestModes(file), /total submode weight/);
  file.modes.discuss.submodes = [];
  assert.throws(() => parseInterestModes(file), /nonempty submodes/);
  const invalid = fixture();
  invalid.modes.discuss.submodes[0].vector = [NaN, 1];
  assert.throws(() => parseInterestModes(invalid), /Invalid submode/);
});

test('mode editor saves use trusted vectors, invalidate text and weight edits, and preserve descriptions', () => {
  const current = fixture();
  const draft = fixture();
  draft.embedding_model.name = 'forged';
  draft.modes.discuss.description = 'News and debate';
  draft.modes.discuss.vector = [9, 9];
  draft.modes.discuss.submodes[0].vector = [9, 9];
  let saved = applyModeEdits(current, draft);
  assert.equal(saved.embedding_model.name, 'test');
  assert.equal(saved.modes.discuss.description, 'News and debate');
  assert.deepEqual(saved.modes.discuss.vector, current.modes.discuss.vector);
  assert.deepEqual(saved.modes.discuss.submodes[0].vector, [1, 0]);
  draft.modes.discuss.submodes[0].weight = 2;
  saved = applyModeEdits(current, draft);
  assert.equal(saved.modes.discuss.vector, null);
  assert.deepEqual(saved.modes.discuss.submodes[0].vector, [1, 0]);
  draft.modes.discuss.submodes[0].text = 'debating';
  saved = applyModeEdits(current, draft);
  assert.equal(saved.modes.discuss.submodes[0].vector, null);
  assert.equal(saved.modes.discuss.submodes[0].embeddedText, null);
  assert.deepEqual(saved.modes.discuss.submodes[1].vector, [0, 1]);
});

test('offline CLI preserves editable data and persists invalidation on text edits', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'qff-mode-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const helper = path.join(dir, 'QFFViz', 'src', 'server');
  await mkdir(helper, { recursive: true });
  for (const name of ['calculate-mode-vectors.ts', 'interest-modes.ts']) {
    await cp(path.join(root, name), path.join(dir, name));
  }
  await cp(path.join(root, 'QFFViz', 'src', 'server', 'files.ts'), path.join(helper, 'files.ts'));
  const file = path.join(dir, 'interest-modes.json');
  const original = fixture();
  await writeFile(file, JSON.stringify(original));
  const run = () => spawnSync(process.execPath, [path.join(dir, 'calculate-mode-vectors.ts')], { encoding: 'utf8' });
  let result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), original);

  original.modes.discuss.submodes[0].text = 'debating';
  await writeFile(file, JSON.stringify(original));
  result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /text changed/);
  const invalidated = parseInterestModes(JSON.parse(await readFile(file, 'utf8')));
  assert.equal(invalidated.modes.discuss.vector, null);
  assert.equal(invalidated.modes.discuss.submodes[0].vector, null);
  assert.equal(invalidated.modes.discuss.submodes[0].embeddedText, null);
  assert.deepEqual(invalidated.modes.discuss.submodes[1], original.modes.discuss.submodes[1]);
});
