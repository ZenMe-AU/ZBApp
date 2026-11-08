import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const vizDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const qffDir = path.dirname(vizDir);
export const identitiesDir = path.join(qffDir, 'Identities');

// Keeps numeric arrays (embeddings) on one line, matching the source files.
export function formatJson(value: unknown): string {
  return (
    JSON.stringify(value, null, 2).replace(
      /\[\s*(-?[\d.eE+-]+(?:,\s*-?[\d.eE+-]+)*)\s*\]/g,
      (_m, inner: string) => `[${inner.split(/,\s*/).join(', ')}]`,
    ) + '\n'
  );
}

/** Writes JSON keeping the existing file's line endings. */
export async function writeJson(file: string, value: unknown): Promise<void> {
  const existing = existsSync(file) ? await readFile(file, 'utf8') : '';
  const text = formatJson(value);
  await writeFile(file, existing.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text, 'utf8');
}

export function resolveDataPath(rel: string | null): string | null {
  if (!rel) return null;
  const full = path.resolve(identitiesDir, rel);
  if (!full.startsWith(identitiesDir + path.sep) || path.extname(full) !== '.json') return null;
  return existsSync(full) ? full : null;
}

export async function listFiles(): Promise<{ path: string; content: unknown }[]> {
  const files: { path: string; content: unknown }[] = [];
  for (const dir of await readdir(identitiesDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const name of await readdir(path.join(identitiesDir, dir.name))) {
      if (!name.endsWith('.json')) continue;
      const text = await readFile(path.join(identitiesDir, dir.name, name), 'utf8');
      files.push({ path: `${dir.name}/${name}`, content: JSON.parse(text) });
    }
  }
  return files;
}
