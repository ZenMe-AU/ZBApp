/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { defineConfig, type Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { interestModesForUi, modesEditorData, saveModesEditor } from "./src/server/embeddings.ts";

const maxBodyBytes = 5 * 1024 * 1024;
let modesMutationRunning = false;

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBodyBytes) throw new Error("Body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readIdentityApi<T>(resource: string): Promise<T> {
  const response = await fetch(`http://127.0.0.1:7181/api/v1/${resource}`);
  if (!response.ok) throw new Error(`Identity Repository responded with ${response.status}`);
  return await response.json() as T;
}

function identitiesApi(): Plugin {
  return {
    name: "qff-identities-api",
    configureServer(server) {
      server.middlewares.use("/api/modes", async (req, res) => {
        try {
          if (req.method === "GET") return sendJson(res, 200, await modesEditorData());
          if (req.method !== "PUT" && req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
          if (modesMutationRunning) return sendJson(res, 409, { error: "Wait for the current mode update to finish." });
          const body = JSON.parse(await readBody(req)) as { data?: unknown, revision?: unknown };
          if (typeof body.revision !== "string") return sendJson(res, 400, { error: "A modes revision is required." });
          if (modesMutationRunning) return sendJson(res, 409, { error: "Wait for the current mode update to finish." });
          modesMutationRunning = true;
          try {
            const current = await modesEditorData();
            if (body.revision !== current.revision) return sendJson(res, 409, { error: "Modes changed on disk. Reload before saving." });
            sendJson(res, 200, await saveModesEditor(body.data, body.revision, req.method === "POST"));
          }
          finally {
            modesMutationRunning = false;
          }
        }
        catch (err) {
          sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
      });

      server.middlewares.use("/api/files", async (req, res) => {
        if (req.method !== "GET") return sendJson(res, 405, { error: "Legacy fixture editing is disabled during the repository migration." });
        try {
          const { profile_ids: ids } = await readIdentityApi<{ profile_ids: string[] }>("profiles");
          const profiles = await Promise.all(ids.map(async (id) => {
            const { profile } = await readIdentityApi<{ profile: Record<string, unknown> }>(`profiles/${encodeURIComponent(id)}`);
            return Object.entries(profile).map(([kind, content]) => ({
              path: `${id}/${id}-${kind === "personas" ? "test-context" : kind}.json`, content,
            }));
          }));
          sendJson(res, 200, profiles.flat());
        }
        catch (err) {
          server.config.logger.error(`QFFViz identity load failed: ${String(err)}`);
          sendJson(res, 502, { error: "Start the local Identity Repository in fixture mode before loading QFFViz." });
        }
      });

      server.middlewares.use("/api/interest-modes", async (_req, res) => {
        try {
          sendJson(res, 200, await interestModesForUi());
        }
        catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      });

      server.middlewares.use("/api/embeddings", (_req, res) => {
        sendJson(res, 503, { error: "Legacy preference embeddings are disabled during the repository migration." });
      });
    },
  };
}

export default defineConfig({
  plugins: [identitiesApi()],
  server: { port: 5180 },
});
