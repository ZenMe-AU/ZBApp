import type { Person } from '../data/types';
import { esc } from './dom';

export const setSources = {
  positive: 'Positive preferences (affinity > 0)',
  interests: 'Interests',
  wants: 'Wants',
  values: 'Values',
  boundaries: 'Boundaries',
  negative: 'Negative preferences (affinity < 0)',
  relationShared: 'Relation topics: shared',
  relationPrivate: 'Relation topics: private',
} as const;

export type SetSource = keyof typeof setSources;

export const normalize = (s: string): string => s.trim().toLowerCase();

export function itemsFor(person: Person, source: SetSource): string[] {
  const prefs = person.properties.personas.flatMap((g) => g.preferences);
  let items: string[];
  switch (source) {
    case 'positive': items = prefs.filter((p) => p.affinity > 0).map((p) => p.keyword); break;
    case 'negative': items = prefs.filter((p) => p.affinity < 0).map((p) => p.keyword); break;
    case 'interests': items = prefs.filter((p) => p.kind === 'interest').map((p) => p.keyword); break;
    case 'wants': items = prefs.filter((p) => p.kind === 'want').map((p) => p.keyword); break;
    case 'values': items = prefs.filter((p) => p.kind === 'value').map((p) => p.keyword); break;
    case 'boundaries': items = prefs.filter((p) => p.kind === 'boundary').map((p) => p.keyword); break;
    case 'relationShared': items = person.relations.relations.flatMap((r) => r.topics_shared); break;
    case 'relationPrivate': items = person.relations.relations.flatMap((r) => r.topics_private); break;
  }
  return [...new Set(items.map(normalize))];
}

export interface Membership {
  name: string;
  sets: string[];
}

/** One entry per item listing the identity names whose set contains it. */
export function membership(people: Person[], source: SetSource): Membership[] {
  const map = new Map<string, string[]>();
  for (const p of people) {
    for (const item of itemsFor(p, source)) map.set(item, [...(map.get(item) ?? []), p.identity.name]);
  }
  return [...map].map(([name, sets]) => ({ name, sets })).sort((a, b) => b.sets.length - a.sets.length || a.name.localeCompare(b.name));
}

export function sourceOptions(selected: SetSource): string {
  return Object.entries(setSources)
    .map(([k, label]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${esc(label)}</option>`)
    .join('');
}
