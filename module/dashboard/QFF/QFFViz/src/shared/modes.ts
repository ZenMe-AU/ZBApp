import { store } from '../data/store';
import type { PreferenceKind } from '../data/types';
import { normalize } from './sets';
import { cosine, hasVector } from './vectors';

export interface ModeVectors {
  model: string;
  names: string[];
  descriptions: Record<string, string>;
  vectors: Record<string, number[]>;
}

export interface ModeKeyword {
  key: string;
  text: string;
  vec: number[];
  kinds: PreferenceKind[];
  owners: string[];
  personas: string[];
  /** Mode implied by the leading verb, used as a labelled test set; empty when the wording is topic-only. */
  label: string;
}

export type ScoreMethod = 'raw' | 'relative' | 'z';

export const scoreMethods: Record<ScoreMethod, string> = {
  raw: 'Raw cosine',
  relative: 'Relative (minus keyword mean)',
  z: 'Standardised (z-score per keyword)',
};

const verbModes: [RegExp, string][] = [
  [/^(watching|attending|spectating)\b/, 'spectate'],
  [/^(playing|doing|riding|joining)\b/, 'participate'],
  [/^(visiting|exploring|touring)\b/, 'visit'],
  [/^(taking|making|creating|writing|building)\b/, 'create'],
  [/^(learning|studying|reading)\b/, 'learn'],
  [/^(discussing|debating|talking)\b/, 'discuss'],
  [/^(helping|volunteering|organising|teaching)\b/, 'help'],
];

export const labelOf = (text: string): string => verbModes.find(([re]) => re.test(normalize(text)))?.[1] ?? '';

export async function loadModes(): Promise<ModeVectors> {
  const res = await fetch('/api/interest-modes');
  if (!res.ok) throw new Error(`Failed to load interest modes: ${res.status}`);
  const body = (await res.json()) as {
    embedding_model?: { name: string; dimensions: number };
    modes: Record<string, { description: string; vector: number[] | null }>;
  };
  const entries = Object.entries(body.modes).filter(([, m]) => hasVector(m.vector));
  return {
    model: body.embedding_model ? `${body.embedding_model.name}, ${body.embedding_model.dimensions} dims` : 'unknown model',
    names: entries.map(([n]) => n),
    descriptions: Object.fromEntries(entries.map(([n, m]) => [n, m.description])),
    vectors: Object.fromEntries(entries.map(([n, m]) => [n, m.vector as number[]])),
  };
}

/** One entry per normalised keyword; interest keywords only unless allKinds is set. */
export function modeKeywords(allKinds: boolean): ModeKeyword[] {
  const map = new Map<string, ModeKeyword>();
  for (const p of store.people) {
    for (const g of p.properties.personas) {
      for (const pref of g.preferences) {
        if (!hasVector(pref.embedding) || (!allKinds && pref.kind !== 'interest')) continue;
        const key = normalize(pref.keyword);
        const entry = map.get(key) ?? { key, text: pref.keyword, vec: pref.embedding, kinds: [], owners: [], personas: [], label: labelOf(pref.keyword) };
        if (!entry.kinds.includes(pref.kind)) entry.kinds.push(pref.kind);
        if (!entry.owners.includes(p.identity.name)) entry.owners.push(p.identity.name);
        entry.personas.push(`${p.identity.name}: ${g.persona}`);
        map.set(key, entry);
      }
    }
  }
  return [...map.values()].sort((a, b) => a.text.localeCompare(b.text));
}

/** Score of a keyword against every mode, in modes.names order. */
export function modeScores(vec: number[], modes: ModeVectors, method: ScoreMethod): number[] {
  const raw = modes.names.map((n) => cosine(vec, modes.vectors[n]));
  if (method === 'raw') return raw;
  const mean = raw.reduce((s, x) => s + x, 0) / raw.length;
  if (method === 'relative') return raw.map((x) => x - mean);
  const sd = Math.sqrt(raw.reduce((s, x) => s + (x - mean) ** 2, 0) / raw.length) || 1;
  return raw.map((x) => (x - mean) / sd);
}

/** Position on the A − B axis: cos(v, A) − cos(v, B). Topic content shared by A and B cancels out. */
export const contrast = (vec: number[], modes: ModeVectors, a: string, b: string): number =>
  cosine(vec, modes.vectors[a]) - cosine(vec, modes.vectors[b]);

export function best(scores: number[], names: string[]): { mode: string; margin: number } {
  const order = scores.map((s, i) => [s, i] as const).sort((x, y) => y[0] - x[0]);
  return { mode: names[order[0][1]], margin: order[0][0] - (order[1]?.[0] ?? order[0][0]) };
}

export const modePalette: Record<string, string> = {
  participate: '#59a14f',
  spectate: '#4e79a7',
  visit: '#f28e2b',
  create: '#b07aa1',
  learn: '#76b7b2',
  discuss: '#edc948',
  help: '#e15759',
};

export const modeColor = (mode: string): string => modePalette[mode] ?? '#9c755f';
