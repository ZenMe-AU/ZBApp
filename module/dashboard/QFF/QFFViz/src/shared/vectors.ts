import type { Person, PreferenceKind } from '../data/types';
import { normalize } from './sets';

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface KeywordVec {
  key: string;
  text: string;
  vec: number[];
  kinds: Set<PreferenceKind>;
  owners: Set<string>;
}

/** One entry per normalised keyword; identical keywords share one vector across identities. */
export function keywordVectors(people: Person[]): KeywordVec[] {
  const map = new Map<string, KeywordVec>();
  for (const p of people) {
    for (const pref of p.properties.personas.flatMap((g) => g.preferences)) {
      if (!pref.embedding?.length) continue;
      const key = normalize(pref.keyword);
      const entry = map.get(key) ?? { key, text: pref.keyword, vec: pref.embedding, kinds: new Set(), owners: new Set() };
      entry.kinds.add(pref.kind);
      entry.owners.add(p.identity.name);
      map.set(key, entry);
    }
  }
  return [...map.values()];
}

/** Describes the embedding model(s) in use; warns when files are not comparable. */
export function modelSummary(people: Person[]): string {
  const models = new Set(people.map((p) => `${p.properties.embedding_model.name} v${p.properties.embedding_model.version}, ${p.properties.embedding_model.dimensions} dims`));
  return models.size === 1 ? [...models][0] : `⚠ mixed models (${[...models].join(' | ')}) — similarities are not comparable`;
}

/** First two principal components via power iteration (no covariance matrix needed). */
export function pca2(vectors: number[][]): [number, number][] {
  const n = vectors.length;
  const d = vectors[0]?.length ?? 0;
  const mean = new Array<number>(d).fill(0);
  vectors.forEach((v) => v.forEach((x, i) => (mean[i] += x / n)));
  const X = vectors.map((v) => v.map((x, i) => x - mean[i]));
  const components: number[][] = [];
  for (let c = 0; c < 2; c++) {
    let w = Array.from({ length: d }, (_, i) => Math.sin(i + 1 + c));
    for (let iter = 0; iter < 100; iter++) {
      const scores = X.map((row) => row.reduce((s, x, i) => s + x * w[i], 0));
      const next = new Array<number>(d).fill(0);
      X.forEach((row, r) => row.forEach((x, i) => (next[i] += x * scores[r])));
      for (const prev of components) {
        const dot = next.reduce((s, x, i) => s + x * prev[i], 0);
        prev.forEach((x, i) => (next[i] -= dot * x));
      }
      const norm = Math.hypot(...next) || 1;
      w = next.map((x) => x / norm);
    }
    components.push(w);
  }
  return X.map((row) => [0, 1].map((c) => row.reduce((s, x, i) => s + x * components[c][i], 0)) as [number, number]);
}
