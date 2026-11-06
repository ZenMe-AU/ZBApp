import { defineConfig, type Plugin } from 'vite';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage } from 'node:http';

const identitiesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../Identities');
const maxBodyBytes = 5 * 1024 * 1024;

// Keeps numeric arrays (embeddings) on one line, matching the source files.
function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(
    /\[\s*(-?[\d.eE+-]+(?:,\s*-?[\d.eE+-]+)*)\s*\]/g,
    (_m, inner: string) => `[${inner.split(/,\s*/).join(', ')}]`,
  ) + '\n';
}

function resolveDataPath(rel: string | null): string | null {
  if (!rel) return null;
  const full = path.resolve(identitiesDir, rel);
  if (!full.startsWith(identitiesDir + path.sep) || path.extname(full) !== '.json') return null;
  return existsSync(full) ? full : null;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBodyBytes) throw new Error('Body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function listFiles() {
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

function identitiesApi(): Plugin {
  return {
    name: 'qff-identities-api',
    configureServer(server) {
      server.middlewares.use('/api/files', async (req, res) => {
        try {
          if (req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(await listFiles()));
            return;
          }
          if (req.method === 'PUT') {
            const target = resolveDataPath(new URL(req.url ?? '', 'http://local').searchParams.get('path'));
            if (!target) {
              res.statusCode = 400;
              res.end('Invalid path');
              return;
            }
            const content = JSON.parse(await readBody(req));
            const existing = await readFile(target, 'utf8');
            const text = formatJson(content);
            await writeFile(target, existing.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text, 'utf8');
            res.statusCode = 204;
            res.end();
            return;
          }
          res.statusCode = 405;
          res.end();
        } catch (err) {
          res.statusCode = 500;
          res.end(err instanceof Error ? err.message : String(err));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [identitiesApi()],
  server: { port: 5180 },
});
