import { defineConfig, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { listFiles, resolveDataPath, writeJson } from './src/server/files.ts';
import { clearStale, embeddingStatus, interestModesForUi, modesEditorData, runEmbeddings, saveModesEditor } from './src/server/embeddings.ts';

const maxBodyBytes = 5 * 1024 * 1024;

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

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

const job = {
  status: 'idle' as 'idle' | 'running' | 'succeeded' | 'failed',
  startedAt: '',
  finishedAt: '',
  options: {} as Record<string, unknown>,
  log: [] as string[],
};
let modesMutationRunning = false;
const modeUpdateInProgress = () => job.status === 'running' || modesMutationRunning;

function identitiesApi(): Plugin {
  return {
    name: 'qff-identities-api',
    configureServer(server) {
      server.middlewares.use('/api/modes', async (req, res) => {
        try {
          if (req.method === 'GET') return sendJson(res, 200, await modesEditorData());
          if (req.method !== 'PUT' && req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
          if (modeUpdateInProgress()) return sendJson(res, 409, { error: 'Wait for the current embedding or mode update to finish.' });
          const body = JSON.parse(await readBody(req)) as { data?: unknown; revision?: unknown };
          if (typeof body.revision !== 'string') return sendJson(res, 400, { error: 'A modes revision is required.' });
          if (modeUpdateInProgress()) return sendJson(res, 409, { error: 'Wait for the current embedding or mode update to finish.' });
          modesMutationRunning = true;
          try {
            const current = await modesEditorData();
            if (body.revision !== current.revision) return sendJson(res, 409, { error: 'Modes changed on disk. Reload before saving.' });
            sendJson(res, 200, await saveModesEditor(body.data, body.revision, req.method === 'POST'));
          } finally {
            modesMutationRunning = false;
          }
        } catch (err) {
          sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
      });

      server.middlewares.use('/api/files', async (req, res) => {
        try {
          if (req.method === 'GET') return sendJson(res, 200, await listFiles());
          if (req.method === 'PUT') {
            const target = resolveDataPath(new URL(req.url ?? '', 'http://local').searchParams.get('path'));
            if (!target) return sendJson(res, 400, { error: 'Invalid path' });
            await writeJson(target, JSON.parse(await readBody(req)));
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

      // Registered before '/api/embeddings' because connect matches by path prefix.
      server.middlewares.use('/api/interest-modes', async (_req, res) => {
        try {
          sendJson(res, 200, await interestModesForUi());
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      });

      server.middlewares.use('/api/embeddings/status', async (_req, res) => {
        try {
          sendJson(res, 200, await embeddingStatus());
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      });

      server.middlewares.use('/api/embeddings/clear-stale', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        if (job.status === 'running' || modesMutationRunning) return sendJson(res, 409, { error: 'An embedding or mode update is in progress' });
        try {
          sendJson(res, 200, { cleared: await clearStale() });
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      });

      server.middlewares.use('/api/embeddings', async (req, res) => {
        try {
          if (req.method === 'GET') return sendJson(res, 200, job);
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end();
            return;
          }
          if (job.status === 'running') return sendJson(res, 409, { error: 'A run is already in progress' });
          const body = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>;
          if (modeUpdateInProgress()) return sendJson(res, 409, { error: 'An embedding or mode update is in progress' });
          const dimensions = Number(body.dimensions ?? 1536);
          if (!Number.isInteger(dimensions) || dimensions < 16 || dimensions > 1536) {
            return sendJson(res, 400, { error: 'dimensions must be an integer between 16 and 1536' });
          }
          const options = { dimensions, force: body.force === true, dryRun: body.dryRun === true };
          Object.assign(job, { status: 'running', startedAt: new Date().toISOString(), finishedAt: '', options, log: [] });
          const log = (line: string) => job.log.push(`${new Date().toLocaleTimeString('en-GB')}  ${line}`);
          runEmbeddings(options, log)
            .then(() => (job.status = 'succeeded'))
            .catch((err: unknown) => {
              log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
              job.status = 'failed';
            })
            .finally(() => (job.finishedAt = new Date().toISOString()));
          sendJson(res, 202, job);
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [identitiesApi()],
  server: { port: 5180 },
});
