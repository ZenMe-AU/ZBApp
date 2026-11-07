export interface JsonChange {
  path: string;
  before: unknown;
  after: unknown;
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function jsonChanges(before: unknown, after: unknown, path = '$'): JsonChange[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.every((x) => typeof x === 'number') && after.every((x) => typeof x === 'number')) {
      return [{ path, before, after }];
    }
    return Array.from({ length: Math.max(before.length, after.length) }, (_, i) =>
      jsonChanges(before[i], after[i], `${path}[${i}]`)).flat();
  }
  if (object(before) && object(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .flatMap((key) => jsonChanges(before[key], after[key], `${path}.${key}`));
  }
  return [{ path, before, after }];
}

export function changeValue(value: unknown): string {
  if (value === undefined) return '(absent)';
  if (Array.isArray(value) && value.length > 16 && value.every((x) => typeof x === 'number')) {
    return `[numeric vector: ${value.length} values]`;
  }
  return JSON.stringify(value, (_key, v: unknown) =>
    Array.isArray(v) && v.length > 16 && v.every((x) => typeof x === 'number')
      ? `[numeric vector: ${v.length} values]` : v, 2);
}
