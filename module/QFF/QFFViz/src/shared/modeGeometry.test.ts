import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modeGeometry, visibleModePoints } from './modeGeometry.ts';
import { type InterestModesFile } from '../../../interest-modes.ts';

function fixture(): InterestModesFile {
  const submode = (name: string, text: string, vector: number[], weight = 1) => ({
    text, definition: text, weight, vector,
  });
  return {
    embedding_model: { name: 'test', version: '1', dimensions: 2 },
    modes: {
      visit: { definition: 'Visit', vector: null, submodes: [
        submode('visit', 'gallery', [1, 0]),
        submode('visit', 'attend', [0, 1]),
        submode('visit', 'candidate', [1, 1], 0),
      ] },
      spectate: { definition: 'Spectate', vector: [0, 1], submodes: [
        submode('spectate', 'watch', [0, 1]),
      ] },
    },
  };
}

test('missing saved averages are previewed offline without changing data', () => {
  const data = fixture();
  const before = structuredClone(data);
  const result = modeGeometry(data);
  assert.equal(result.points.length, 6);
  const parent = result.points.find((p) => p.id === 'visit')!;
  assert.deepEqual(parent.vector, [0.5, 0.5]);
  assert.match(parent.issue!, /missing calculated/);
  assert.deepEqual(data, before);
  assert.equal(result.warnings.length, 0);
});

test('leave-one-out reveals self-inclusion bias and competing mode alignment', () => {
  const result = modeGeometry(fixture());
  const attend = result.alignment.find((a) => a.point.text === 'attend')!;
  assert.ok(Math.abs(attend.parentScore! - Math.SQRT1_2) < 1e-12);
  assert.equal(attend.siblingScore, 0);
  assert.deepEqual(attend.rival, { mode: 'spectate', score: 1 });
  assert.equal(attend.margin, -1);
  const watch = result.alignment.find((a) => a.point.text === 'watch')!;
  assert.equal(watch.siblingScore, null);
  assert.match(watch.siblingIssue!, /No other/);
});

test('zero-weight candidates remain visible but do not move parent averages', () => {
  const data = fixture();
  const result = modeGeometry(data);
  assert.equal(result.points.find((p) => p.text === 'candidate')!.weight, 0);
  const candidate = result.alignment.find((a) => a.point.text === 'candidate')!;
  assert.ok(Math.abs(candidate.siblingScore! - 1) < 1e-12);
  data.modes.visit.submodes[2].vector = [-1, -1];
  assert.deepEqual(modeGeometry(data).points.find((p) => p.id === 'visit')!.vector, [0.5, 0.5]);
});

test('stale and dimension-mismatched vectors are excluded and explained', () => {
  const data = fixture();
  data.modes.visit.submodes[0].vector = null;
  data.modes.visit.submodes[2].vector = [1];
  const result = modeGeometry(data);
  assert.ok(!result.points.some((p) => p.id === 'visit' || p.id === 'visit:0' || p.id === 'visit:2'));
  assert.ok(result.warnings.some((w) => w.includes('missing submode vector')));
  assert.ok(result.warnings.some((w) => w.includes('dimensions differ')));
  assert.equal(result.alignment.find((a) => a.point.text === 'attend')!.siblingScore, null);
});

test('mode visibility cascades and individual choices survive parent toggling', () => {
  const { points } = modeGeometry(fixture());
  const modes = new Set<string>();
  const submodes = new Set(['visit:1']);
  assert.equal(visibleModePoints(points, modes, submodes).length, 5);
  modes.add('visit');
  assert.deepEqual(visibleModePoints(points, modes, submodes).map((p) => p.mode), ['spectate', 'spectate']);
  modes.clear();
  assert.ok(!visibleModePoints(points, modes, submodes).some((p) => p.id === 'visit:1'));
  modes.add('visit'); modes.add('spectate');
  assert.equal(visibleModePoints(points, modes, submodes).length, 0);
});

test('zero vectors do not masquerade as valid projected points', () => {
  const data = fixture();
  data.modes.spectate.submodes[0].vector = [0, 0];
  const result = modeGeometry(data);
  assert.ok(!result.points.some((p) => p.mode === 'spectate'));
  assert.ok(result.warnings.some((w) => w.includes('zero-length')));
});
