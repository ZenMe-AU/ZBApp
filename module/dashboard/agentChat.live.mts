/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { randomUUID } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import { readFile, rm, writeFile } from "node:fs/promises";

type PendingMessage = { message: string; response: ServerResponse };
type LiveEndpoint = { url: string; token: string };

export async function startLiveChat(runPath: string, names: string[]) {
  const token = randomUUID();
  const queues = new Map(names.map((name) => [name, [] as PendingMessage[]]));
  const server = createServer(async (request, response) => {
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (request.method !== "POST" || request.url !== "/" || request.headers.authorization !== `Bearer ${token}`) {
      send(403, { error: "Authorized live chat request required" });
      return;
    }
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 8192) {
          send(413, { error: "Live chat request too large" });
          return;
        }
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const queue = queues.get(body.agent);
      if (!queue) {
        send(409, {
          error: "This agent is offline or has finished its action loop.",
        });
      } else if (typeof body.message !== "string" || !body.message.trim() || body.message.length > 1000) {
        send(400, { error: "Message must be 1-1000 characters" });
      } else if (queue.length) {
        send(409, {
          error: "This agent already has a pending dashboard message.",
        });
      } else {
        queue.push({ message: body.message.trim(), response });
      }
    } catch (error) {
      console.error("Live agent chat request failed:", error);
      send(400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Live agent chat did not obtain a TCP port");
  const endpoint: LiveEndpoint = {
    url: `http://127.0.0.1:${address.port}`,
    token,
  };
  try {
    await writeFile(`${runPath}.live.json`, JSON.stringify(endpoint), {
      mode: 0o600,
    });
  } catch (error) {
    server.close();
    throw error;
  }

  return {
    async drain(name: string, answer: (message: string) => Promise<string>): Promise<boolean> {
      const queue = queues.get(name);
      const pending = queue?.[0];
      if (!pending) return false;
      try {
        if (pending.response.destroyed) return false;
        const reply = await answer(pending.message);
        sendReply(pending.response, 200, { answer: reply });
        return true;
      } catch (error) {
        console.error(`Live chat with ${name} failed:`, error);
        sendReply(pending.response, 503, {
          error: error instanceof Error ? error.message : String(error),
        });
        return true;
      } finally {
        queue.shift();
      }
    },
    finish(name: string) {
      for (const pending of queues.get(name) ?? []) {
        sendReply(pending.response, 409, {
          error: "This agent has finished its action loop.",
        });
      }
      queues.delete(name);
    },
    async close() {
      for (const queue of queues.values()) {
        for (const pending of queue)
          sendReply(pending.response, 409, {
            error: "The agent run has ended.",
          });
      }
      queues.clear();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      await rm(`${runPath}.live.json`, { force: true });
    },
  };
}

export async function sendLiveChat(runPath: string, agent: string, message: string): Promise<{ answer: string }> {
  const endpoint: LiveEndpoint = JSON.parse(await readFile(`${runPath}.live.json`, "utf8"));
  const url = new URL(endpoint.url);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") throw new Error("Invalid live agent chat endpoint");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${endpoint.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ agent, message }),
    signal: AbortSignal.timeout(200_000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `Live agent chat failed (${response.status})`);
  if (typeof body.answer !== "string") throw new Error("Live agent chat returned no answer");
  return { answer: body.answer };
}

function sendReply(response: ServerResponse, status: number, body: unknown) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}
