import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DefaultAzureCredential } from '@azure/identity';
import { identitiesDir, listFiles, qffDir, vizDir, writeJson } from './files.ts';

export interface EmbedOptions {
  dimensions: number;
  force: boolean;
  dryRun: boolean;
}

interface Preference {
  keyword: string;
  kind: string;
  embedding: number[] | null;
}

interface PropertiesFile {
  embedding_model: { name: string; version: string; dimensions: number };
  personas: { persona: string; preferences: Preference[] }[];
  kind_vectors?: Record<string, number[]>;
}

const configFile = path.join(vizDir, 'embedding.config.json');
const kindsFile = path.join(qffDir, 'embedding-kinds.json');
const cacheFile = path.join(vizDir, '.cache', 'embeddings.json');
const batchSize = 256;
// USD per 1M tokens (Azure pricing page, Nov 2026); used for the log estimate only.
const pricePerMillion: Record<string, number> = { 'text-embedding-3-small': 0.022, 'text-embedding-3-large': 0.143 };
const credential = new DefaultAzureCredential();

const normalize = (s: string) => s.trim().toLowerCase();
const round = (v: number) => Math.round(v * 1e6) / 1e6;

async function readJson<T>(file: string, fallback?: T): Promise<T> {
  if (!existsSync(file)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing ${path.relative(qffDir, file)}`);
  }
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

async function embed(
  config: { endpoint: string; deployment: string },
  inputs: string[],
  dimensions: number,
  log: (line: string) => void,
): Promise<{ vectors: number[][]; tokens: number }> {
  const { token } = await credential.getToken('https://cognitiveservices.azure.com/.default');
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${config.endpoint}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.deployment, input: inputs, dimensions }),
    });
    if (res.status === 429 && attempt < 5) {
      const wait = Number(res.headers.get('retry-after') ?? 10);
      log(`Rate limited, retrying in ${wait}s (attempt ${attempt})`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Embedding request failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { data: { index: number; embedding: number[] }[]; usage: { total_tokens: number } };
    const vectors: number[][] = [];
    for (const d of body.data) vectors[d.index] = d.embedding.map(round);
    return { vectors, tokens: body.usage.total_tokens };
  }
}

/** Regenerates concept and kind vectors in every *-properties.json file. */
export async function runEmbeddings(options: EmbedOptions, log: (line: string) => void): Promise<void> {
  const config = await readJson<{ endpoint: string; deployment: string }>(configFile);
  const kinds = await readJson<Record<string, string>>(kindsFile);
  const cache = options.force ? {} : await readJson<Record<string, number[]>>(cacheFile, {});
  const cacheKey = (text: string) => `${config.deployment}|${options.dimensions}|${text}`;
  log(`Deployment ${config.deployment} at ${config.endpoint}, ${options.dimensions} dimensions`);

  const files = (await listFiles()).filter((f) => f.path.endsWith('-properties.json'));
  const texts = new Set<string>();
  const missingKinds = new Set<string>();
  for (const f of files) {
    for (const g of (f.content as PropertiesFile).personas) {
      for (const p of g.preferences) {
        texts.add(normalize(p.keyword));
        if (!kinds[p.kind]) missingKinds.add(p.kind);
      }
    }
  }
  if (missingKinds.size) throw new Error(`No description in embedding-kinds.json for kind(s): ${[...missingKinds].join(', ')}`);
  const kindText = (kind: string) => `${kind}: ${kinds[kind]}`;
  Object.keys(kinds).forEach((k) => texts.add(kindText(k)));

  const missing = [...texts].filter((t) => !cache[cacheKey(t)]);
  const estTokens = missing.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0);
  const price = pricePerMillion[config.deployment] ?? 0;
  log(`${files.length} properties files, ${texts.size} unique texts, ${texts.size - missing.length} cached, ${missing.length} to embed`);
  log(`Estimated ${estTokens} tokens ≈ US$${((estTokens / 1e6) * price).toFixed(6)}`);
  if (options.dryRun) {
    log('Dry run: no API calls made and no files changed.');
    return;
  }

  let tokens = 0;
  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize);
    log(`Embedding batch ${i / batchSize + 1} (${batch.length} texts)…`);
    const result = await embed(config, batch, options.dimensions, log);
    batch.forEach((t, j) => (cache[cacheKey(t)] = result.vectors[j]));
    tokens += result.tokens;
  }
  if (missing.length) {
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify(cache));
    log(`Used ${tokens} tokens ≈ US$${((tokens / 1e6) * price).toFixed(6)}`);
  }

  for (const f of files) {
    const content = f.content as PropertiesFile;
    const used = new Set<string>();
    for (const g of content.personas) {
      for (const p of g.preferences) {
        p.embedding = cache[cacheKey(normalize(p.keyword))];
        used.add(p.kind);
      }
    }
    content.embedding_model = { name: config.deployment, version: '1', dimensions: options.dimensions };
    content.kind_vectors = Object.fromEntries([...used].sort().map((k) => [k, cache[cacheKey(kindText(k))]]));
    await writeJson(path.join(identitiesDir, f.path), content);
    log(`Wrote ${f.path}`);
  }
  log('Done.');
}
