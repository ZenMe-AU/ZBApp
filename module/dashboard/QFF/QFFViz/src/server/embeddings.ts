import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DefaultAzureCredential } from '@azure/identity';
import { identitiesDir, listFiles, qffDir, vizDir, writeJson } from './files.ts';
import { clearChangedSubmodes, modeIssue, parseInterestModes, submodeInput, submodeIssue, type InterestModesFile } from '../../../interest-modes.ts';

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
const modesFile = path.join(qffDir, 'interest-modes.json');
const cacheFile = path.join(vizDir, '.cache', 'embeddings.json');
const batchSize = 256;
// USD per 1M tokens (Azure pricing page, Nov 2026); used for the log estimate only.
const pricePerMillion: Record<string, number> = { 'text-embedding-3-small': 0.022, 'text-embedding-3-large': 0.143 };
const credential = new DefaultAzureCredential();

const normalize = (s: string) => s.trim().toLowerCase();
const round = (v: number) => Math.round(v * 1e6) / 1e6;
const sameVector = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const describe = (label: string, description: string) => `${label}: ${description}`;

async function readJson<T>(file: string, fallback?: T): Promise<T> {
  if (!existsSync(file)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing ${path.relative(qffDir, file)}`);
  }
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

async function readModes(): Promise<InterestModesFile> {
  return parseInterestModes(await readJson<unknown>(modesFile));
}

export async function interestModesForUi() {
  const file = await readModes();
  return {
    embedding_model: file.embedding_model,
    modes: Object.fromEntries(Object.entries(file.modes).map(([name, mode]) => [
      name,
      { description: mode.description, vector: modeIssue(name, mode, file.embedding_model.dimensions) ? null : mode.vector },
    ])),
  };
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
  const kindText = (kind: string) => describe(kind, kinds[kind]);
  Object.keys(kinds).forEach((k) => texts.add(kindText(k)));
  
  const modes = await readModes();
  for (const [modeName, modeData] of Object.entries(modes.modes)) {
    for (const submode of modeData.submodes) {
      texts.add(submodeInput(modeName, submode));
    }
  }

  const missing = [...texts].filter((t) => !cache[cacheKey(t)]);
  const estTokens = missing.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0);
  const price = pricePerMillion[config.deployment] ?? 0;
  log(`${files.length} properties files, ${texts.size} unique texts, ${texts.size - missing.length} cached, ${missing.length} to embed`);
  log(`Estimated ${estTokens} tokens ≈ US$${((estTokens / 1e6) * price).toFixed(6)}`);
  if (options.dryRun) {
    log('Dry run: no API calls made and no files changed.');
    return;
  }

  const cleared = clearChangedSubmodes(modes);
  const modelChanged = modes.embedding_model.name !== config.deployment ||
    modes.embedding_model.dimensions !== options.dimensions;
  for (const [name, mode] of Object.entries(modes.modes)) {
    for (const submode of mode.submodes) {
      const cached = cache[cacheKey(submodeInput(name, submode))];
      if (options.force || modelChanged || !cached || !submode.vector || !sameVector(submode.vector, cached)) {
        submode.vector = null;
        submode.embeddedText = null;
        mode.vector = null;
      }
    }
  }
  await writeJson(modesFile, modes);
  if (cleared) log(`Cleared ${cleared} submode vector(s) whose text changed`);

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
  modes.embedding_model = { name: config.deployment, version: '1', dimensions: options.dimensions };
  let submodeCount = 0;
  for (const [name, mode] of Object.entries(modes.modes)) {
    for (const submode of mode.submodes) {
      const input = submodeInput(name, submode);
      const vector = cache[cacheKey(input)];
      if (!vector || vector.length !== options.dimensions || !vector.every(Number.isFinite)) {
        throw new Error(`Missing or invalid embedding for ${input}`);
      }
      submode.vector = vector;
      submode.embeddedText = input;
      submodeCount++;
    }
  }
  await writeJson(modesFile, modes);
  log(`Wrote ${path.basename(modesFile)} (${submodeCount} submode vectors)`);
  log(`Next step: run 'npm run calculate-mode-vectors' to compute mode averages in ${path.basename(modesFile)}.`);
  log('Done.');
}

export interface StaleItem {
  path: string;
  persona: string;
  keyword: string;
  reason: string;
}

export interface EmbeddingStatus {
  deployment: string;
  cacheEntries: number;
  stale: StaleItem[];
  staleKinds: { path: string; kind: string; reason: string }[];
  staleModes: { mode: string; reason: string }[];
}

const unverified = 'unverified (no local cache)';

/** Finds vectors that no longer match their current text, by comparing with the local embedding cache. */
export async function embeddingStatus(): Promise<EmbeddingStatus> {
  const config = await readJson<{ endpoint: string; deployment: string }>(configFile);
  const kinds = await readJson<Record<string, string>>(kindsFile);
  
  const modes = await readModes();
  const cache = await readJson<Record<string, number[]>>(cacheFile, {});
  const hasCache = Object.keys(cache).length > 0;
  const files = (await listFiles()).filter((f) => f.path.endsWith('-properties.json'));
  const status: EmbeddingStatus = { deployment: config.deployment, cacheEntries: Object.keys(cache).length, stale: [], staleKinds: [], staleModes: [] };

  const check = (vec: number[] | null | undefined, model: string, dims: number, text: string): string | null => {
    if (!vec?.length) return 'missing';
    if (model !== config.deployment || vec.length !== dims) return 'different model or dimensions';
    const cached = cache[`${config.deployment}|${dims}|${text}`];
    if (!cached) return hasCache ? 'text changed since last embedding' : unverified;
    return sameVector(vec, cached) ? null : 'vector differs from cache';
  };

  let dims = 0;
  for (const f of files) {
    const content = f.content as PropertiesFile;
    dims = content.embedding_model.dimensions;
    const used = new Set<string>();
    for (const g of content.personas) {
      for (const p of g.preferences) {
        used.add(p.kind);
        const reason = check(p.embedding, content.embedding_model.name, dims, normalize(p.keyword));
        if (reason) status.stale.push({ path: f.path, persona: g.persona, keyword: p.keyword, reason });
      }
    }
    for (const kind of used) {
      const kindText = (k: string) => describe(k, kinds[k]);
      const reason = kinds[kind]
        ? check(content.kind_vectors?.[kind], content.embedding_model.name, dims, kindText(kind))
        : 'no description in embedding-kinds.json';
      if (reason) status.staleKinds.push({ path: f.path, kind, reason });
    }
  }

  for (const [modeName, modeData] of Object.entries(modes.modes)) {
    const reasons: string[] = [];
    for (const submode of modeData.submodes) {
      const reason = submodeIssue(modeName, submode, modes.embedding_model.dimensions) ?? check(
        submode.vector,
        modes.embedding_model.name,
        modes.embedding_model.dimensions,
        submodeInput(modeName, submode),
      );
      if (reason && !reasons.includes(reason)) reasons.push(reason);
    }
    const issue = modeIssue(modeName, modeData, modes.embedding_model.dimensions);
    if (issue && !reasons.includes(issue)) reasons.push(issue);
    if (reasons.length) status.staleModes.push({ mode: modeName, reason: reasons.join('; ') });
  }
  return status;
}

/** Sets stale preference embeddings to null and removes stale kind vectors so no view uses them. */
export async function clearStale(): Promise<number> {
  const status = await embeddingStatus();
  const files = (await listFiles()).filter((f) => f.path.endsWith('-properties.json'));
  let cleared = 0;
  for (const f of files) {
    const content = f.content as PropertiesFile;
    let changed = false;
    for (const g of content.personas) {
      for (const p of g.preferences) {
        const hit = status.stale.some((s) => s.path === f.path && s.persona === g.persona && s.keyword === p.keyword && s.reason !== unverified);
        if (hit && p.embedding !== null) {
          p.embedding = null;
          changed = true;
          cleared++;
        }
      }
    }
    for (const s of status.staleKinds.filter((k) => k.path === f.path && k.reason !== unverified)) {
      if (content.kind_vectors?.[s.kind]) {
        delete content.kind_vectors[s.kind];
        changed = true;
        cleared++;
      }
    }
    if (changed) await writeJson(path.join(identitiesDir, f.path), content);
  }
  const modes = await readModes();
  cleared += clearChangedSubmodes(modes);
  const config = await readJson<{ deployment: string }>(configFile);
  const cache = await readJson<Record<string, number[]>>(cacheFile, {});
  for (const hit of status.staleModes.filter((s) => s.reason !== unverified)) {
    const mode = modes.modes[hit.mode];
    for (const submode of mode.submodes) {
      const cached = cache[`${config.deployment}|${modes.embedding_model.dimensions}|${submodeInput(hit.mode, submode)}`];
      if (submode.vector !== null && (
        modes.embedding_model.name !== config.deployment ||
        submode.vector.length !== modes.embedding_model.dimensions ||
        (cached ? !sameVector(submode.vector, cached) : Object.keys(cache).length > 0)
      )) {
        submode.vector = null;
        submode.embeddedText = null;
        cleared++;
      }
    }
    if (mode.vector !== null) {
      mode.vector = null;
      cleared++;
    }
  }
  await writeJson(modesFile, modes);
  return cleared;
}
