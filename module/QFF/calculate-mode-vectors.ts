#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { averageMode, clearChangedSubmodes, parseInterestModes } from './interest-modes.ts';
import { writeJson } from './QFFViz/src/server/files.ts';

async function main(): Promise<void> {
  const file = fileURLToPath(new URL('./interest-modes.json', import.meta.url));
  const modes = parseInterestModes(JSON.parse(await readFile(file, 'utf8')));
  const cleared = clearChangedSubmodes(modes);
  if (cleared) {
    await writeJson(file, modes);
    console.error(`Cleared ${cleared} vector(s) whose source text changed.`);
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
