#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { averageMode, parseInterestModes, submodeInput } from './interest-modes.ts';
import { writeJson } from './QFFViz/src/server/files.ts';

async function main(): Promise<void> {
  const file = fileURLToPath(new URL('./interest-modes.json', import.meta.url));
  const modes = parseInterestModes(JSON.parse(await readFile(file, 'utf8')));
  const cachePath = fileURLToPath(new URL('./QFFViz/.cache/embeddings.json', import.meta.url));
  if (!existsSync(cachePath)) throw new Error('Embedding cache missing; refresh embeddings before offline recalculation.');
  const cache = JSON.parse(await readFile(cachePath, 'utf8')) as Record<string, number[]>;
  for (const [name, mode] of Object.entries(modes.modes)) {
    for (const submode of mode.submodes) {
      if (submode.weight === 0) continue;
      const key = `${modes.embedding_model.name}|${modes.embedding_model.dimensions}|${submodeInput(name, submode)}`;
      const cached = cache[key];
      const vector = submode.vector;
      if (!cached || !vector || cached.length !== vector.length ||
        cached.some((value, i) => value !== vector[i])) {
        throw new Error(`${name}: unverified or stale submode definition (${submode.text}); refresh embeddings`);
      }
    }
  }
  const averages = Object.entries(modes.modes).map(([name, mode]) => ({
    name, vector: averageMode(name, mode, modes.embedding_model.dimensions),
  }));
  for (const { name, vector } of averages) {
    modes.modes[name].vector = vector;
    console.log(`${name}: averaged ${modes.modes[name].submodes.length} submodes`);
  }
  await writeJson(file, modes);
  console.log(`Updated ${averages.length} mode averages in interest-modes.json (no network access).`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
