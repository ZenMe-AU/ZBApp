import type { Person, PreferenceKind } from '../data/types';
import { normalize } from './sets';

import { cosine, hasVector } from './cosine';
export { cosine, hasVector } from './cosine';

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
      if (!hasVector(pref.embedding)) continue;
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

/** Top principal components via power iteration, plus the share of total variance each explains. */
export function pca(vectors: number[][], dims: number): { coords: number[][]; explained: number[] } {
  const n = vectors.length;
  const d = vectors[0]?.length ?? 0;
  const mean = new Array<number>(d).fill(0);
  vectors.forEach((v) => v.forEach((x, i) => (mean[i] += x / n)));
  const X = vectors.map((v) => v.map((x, i) => x - mean[i]));
  const total = X.reduce((s, row) => s + row.reduce((t, x) => t + x * x, 0), 0) || 1;
  const components: number[][] = [];
  for (let c = 0; c < dims; c++) {
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
  const coords = X.map((row) => components.map((w) => row.reduce((s, x, i) => s + x * w[i], 0)));
  const explained = components.map((_, c) => coords.reduce((s, p) => s + p[c] * p[c], 0) / total);
  return { coords, explained };
}

/** Deterministic PRNG so UMAP and k-means layouts are repeatable. */
export function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Spherical k-means (cosine) with k-means++ seeding; returns a cluster label per vector. */
export function kmeans(vectors: number[][], k: number, seed = 1): number[] {
  const random = seededRandom(seed);
  const centroids = [vectors[Math.floor(random() * vectors.length)]];
  while (centroids.length < Math.min(k, vectors.length)) {
    const dist = vectors.map((v) => Math.min(...centroids.map((c) => 1 - cosine(v, c))) ** 2);
    let r = random() * dist.reduce((s, x) => s + x, 0);
    centroids.push(vectors[Math.max(0, dist.findIndex((x) => (r -= x) <= 0))]);
  }
  let labels: number[] = [];
  for (let iter = 0; iter < 50; iter++) {
    const next = vectors.map((v) => centroids.reduce((best, c, i) => (cosine(v, c) > cosine(v, centroids[best]) ? i : best), 0));
    if (next.every((l, i) => l === labels[i])) break;
    labels = next;
    centroids.forEach((_, c) => {
      const members = vectors.filter((_, i) => labels[i] === c);
      if (members.length) centroids[c] = members[0].map((_, j) => members.reduce((s, m) => s + m[j], 0) / members.length);
    });
  }
  return labels;
}
