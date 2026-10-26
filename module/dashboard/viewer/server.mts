/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { appendFile, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { initRepository } from "quest3Tier/dist/repository/table/repository.mjs";
import { sendLiveChat } from "../agentChat.live.mjs";
import { answerResults } from "./results-chat.mjs";

const VIEWER_DIR = path.dirname(fileURLToPath(import.meta.url));
const viewerParent = path.resolve(VIEWER_DIR, "..");
const DASHBOARD_DIR = path.basename(viewerParent) === "dist" ? path.resolve(VIEWER_DIR, "../..") : viewerParent;
const SOURCE_VIEWER_DIR = path.join(DASHBOARD_DIR, "viewer");
const RUNS_DIR = path.join(DASHBOARD_DIR, "runs");
const REPO_DIR = path.resolve(DASHBOARD_DIR, "../..");
const RUN_SCRIPT = path.join(DASHBOARD_DIR, "dist/agentChat.run.mjs");
const AZURITE_BIN = path.join(REPO_DIR, "node_modules/azurite/dist/src/azurite.js");
const HOST = "127.0.0.1";
const PORT = Number(process.env.AGENT_VIEW_PORT ?? 4178);
const CHILD_ENV = { ...process.env };
delete CHILD_ENV.NODE_OPTIONS;
delete CHILD_ENV.VSCODE_INSPECTOR_OPTIONS;
const STATIC_FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/viewer.mjs": ["viewer.mjs", "text/javascript; charset=utf-8"],
  "/viewer-data.mjs": ["viewer-data.mjs", "text/javascript; charset=utf-8"],
  "/viewer-elements.mjs": ["viewer-elements.mjs", "text/javascript; charset=utf-8"],
  "/viewer-profiles.mjs": ["viewer-profiles.mjs", "text/javascript; charset=utf-8"],
  "/viewer-results.mjs": ["viewer-results.mjs", "text/javascript; charset=utf-8"],
  "/viewer-questions.mjs": ["viewer-questions.mjs", "text/javascript; charset=utf-8"],
} as const;
type RunState = {
  status: string;
  humanMode?: boolean;
  startedAt?: string;
  finishedAt?: string;
  humanProfileId?: string;
  humanName?: string;
  error?: string;
  exitCode?: number;
};
const state: { runProcess?: ChildProcess; azuriteProcess?: ChildProcess; run: RunState } = { run: { status: "idle" } };
const tableRepositoryState: { value?: Promise<{ listFriends(profileId: string): Promise<unknown[]> }> } = {};
const pendingHuman: { profileId?: string; name?: string } = {};
const registeredHuman: { profileId?: string; name?: string } = {};
const HUMAN_STATE_PATH = path.join(RUNS_DIR, ".human.json");
let resultsChatPending = false;

async function loadRegisteredHuman() {
  const saved = JSON.parse(await readFile(HUMAN_STATE_PATH, "utf8").catch(() => "{}"));
  if (typeof saved.profileId === "string" && saved.profileId.trim()) registeredHuman.profileId = saved.profileId.trim();
  if (typeof saved.name === "string" && saved.name.trim()) registeredHuman.name = saved.name.trim();
}

async function rememberHuman(profileId: string, name: string) {
  registeredHuman.profileId = profileId;
  registeredHuman.name = name;
  await writeFile(HUMAN_STATE_PATH, JSON.stringify(registeredHuman, null, 2));
}

async function localSettings() {
  const settingsPath = path.join(DASHBOARD_DIR, "local.settings.json");
  return JSON.parse(await readFile(settingsPath, "utf8").catch(() => "{}")).Values ?? {};
}

async function getAgentOids(): Promise<Record<string, string>> {
  const { AGENTS } = await import("./viewer-data.mjs");
  return Object.fromEntries(await Promise.all(AGENTS.map(async (name) => {
    const text = await readFile(path.join(DASHBOARD_DIR, name, `${name}.agent.md`), "utf8");
    const frontmatter = text.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1];
    const oid = frontmatter?.match(/^oid:\s*(\S+)\s*$/m)?.[1];
    if (!oid) throw new Error(`Missing oid in ${name}.agent.md`);
    return [name, oid];
  })));
}

const spawnPnpm = (args: string[], cwd: string, env = CHILD_ENV) =>
  spawn(process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "pnpm", process.platform === "win32" ? ["/d", "/s", "/c", "pnpm", ...args] : args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

const isRunName = (name) => typeof name === "string" && path.basename(name) === name && name.endsWith(".chat.md");

async function listRuns() {
  const entries = await readdir(RUNS_DIR, { withFileTypes: true }).catch(() => []);
  const runs = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && isRunName(entry.name))
      .map(async (entry) => ({ name: entry.name, mtime: (await stat(path.join(RUNS_DIR, entry.name))).mtimeMs }))
  );
  return runs.sort((a, b) => b.mtime - a.mtime);
}

async function getTableRepository() {
  if (!tableRepositoryState.value) {
    tableRepositoryState.value = (async () => {
      const settings = await localSettings();
      return initRepository({
        AzureWebJobsStorage: process.env.AzureWebJobsStorage ?? settings.AzureWebJobsStorage,
        AzureWebJobsStorage__tableServiceUri: process.env.AzureWebJobsStorage__tableServiceUri ?? settings.AzureWebJobsStorage__tableServiceUri,
        AzureWebJobsStorage__clientId: process.env.AzureWebJobsStorage__clientId ?? settings.AzureWebJobsStorage__clientId,
      });
    })();
  }
  return tableRepositoryState.value;
}

async function getRunNetwork(run: string) {
  const { parseReport } = await import("./viewer-data.mjs");
  const text = await readFile(path.join(RUNS_DIR, run.replace(/\.chat\.md$/, ".md")), "utf8").catch(() => "");
  const profileIds = parseReport(text).profileIds;
  if (!Object.keys(profileIds).length) return {};
  const repository = await getTableRepository();
  const networks = await Promise.all(Object.entries(profileIds).map(async ([name, profileId]) => [name, await repository.listFriends(profileId)]));
  return Object.fromEntries(networks);
}

function send(response, status, contentType, body) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:",
    "Content-Type": contentType,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

const sendJson = (response, status, body) => send(response, status, "application/json; charset=utf-8", JSON.stringify(body));
const isSameOrigin = (request) => request.headers.origin === `http://${HOST}:${PORT}`;
const isQ3Origin = (request) => ["http://localhost:5183", "http://127.0.0.1:5183"].includes(request.headers.origin ?? "");
const sendJoinJson = (response, status, body, origin) => {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  });
  response.end(JSON.stringify(body));
};
const CHAT_SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
};
const AGENT_NAMES = new Set(["Mike", "Bella", "Ian", "Eric"]);

async function readJson(request) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

async function answerAboutRun(run: string, message: string, history: unknown[], agent = "") {
  if (agent) {
    if (!state.runProcess || state.run.status !== "running")
      throw new Error("Live agent chat requires an active run. Finished or offline agents cannot receive messages.");
    try {
      return await sendLiveChat(path.join(RUNS_DIR, run), agent, message);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw new Error("This run has no active agent chat endpoint. It may still be starting or its agents have finished.");
      }
      throw error;
    }
  }
  if (state.runProcess || ["starting", "waiting-for-human"].includes(state.run.status)) {
    throw new Error("The results assistant is available after the run ends. Select an active agent to chat during the run.");
  }
  if (resultsChatPending) throw new Error("The results assistant is already answering a message.");
  resultsChatPending = true;
  try {
    const report = await readFile(path.join(RUNS_DIR, run.replace(/\.chat\.md$/, ".md")), "utf8").catch(() => "");
    const chat = await readFile(path.join(RUNS_DIR, run), "utf8").catch(() => "");
    const env = { ...CHILD_ENV, ...(await localSettings()) };
    return await answerResults(
      {
        systemPrompt:
          "You are the Q3 Agent Lab results assistant. Answer only from the supplied run report and chat log. Explain evidence and uncertainty plainly. Do not invent events, scores or people. Keep the answer concise.",
        input: { question: message, history: history.slice(-8), report: report.slice(-30000), chat: chat.slice(-20000) },
        model: env.CHAT_MODEL ?? env.AGENT_MODEL ?? env.LLM_MODEL ?? "",
        schema: CHAT_SCHEMA,
        sandbox: RUNS_DIR,
        options: { effort: "low", thinking: false, maxTokens: 512 },
      },
      env
    );
  } finally {
    resultsChatPending = false;
  }
}

const portOpen = (port, host = HOST) =>
  new Promise((resolve) => {
    const socket = connect(port, host);
    socket.setTimeout(300);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    const closed = () => resolve(false);
    socket.once("error", closed);
    socket.once("timeout", () => {
      socket.destroy();
      closed();
    });
  });

const waitForPort = async (port, host, attempts) => {
  for (const _attempt of Array.from({ length: attempts })) {
    if (await portOpen(port, host)) return true;
    await delay(100);
  }
  return false;
};

async function ensureServices() {
  if (!(await portOpen(10002))) {
    state.azuriteProcess = spawn(process.execPath, [AZURITE_BIN, "--location", REPO_DIR, "--tableHost", HOST, "--tablePort", "10002", "--silent"], {
      cwd: REPO_DIR,
      env: CHILD_ENV,
      stdio: ["ignore", "pipe", "pipe"],
    });
    state.azuriteProcess.stdout?.pipe(process.stdout);
    state.azuriteProcess.stderr?.pipe(process.stderr);
    if (!(await waitForPort(10002, HOST, 50))) throw new Error("Azurite Table did not start on port 10002");
  }
  if (!(await portOpen(7073))) throw new Error("Q3 API is not running on port 7073. Start the Agent Start debug configuration first.");
}

async function startRun(humanProfileId?: string, humanName = "Human") {
  if (resultsChatPending) throw new Error("Wait for the results assistant to finish before starting another run.");
  const humanMode = Boolean(humanProfileId);
  state.run = { status: "starting", humanMode, ...(humanProfileId && { humanProfileId, humanName }), startedAt: new Date().toISOString() };
  console.log(`Starting agent run${humanMode ? " with a Q3 human participant" : ""}...`);
  await ensureServices();
  const childEnv = { ...CHILD_ENV, ...(await localSettings()), AGENT_RUN: "1" };
  if (humanMode) Object.assign(childEnv, { HUMAN_RUN: "1", HUMAN_PROFILE_ID: humanProfileId });
  const child = spawn(process.execPath, [RUN_SCRIPT], {
    cwd: DASHBOARD_DIR,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  state.runProcess = child;
  state.run = { ...state.run, status: "running" };
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  const finish = (status, detail) => {
    if (state.runProcess !== child) return;
    state.runProcess = undefined;
    state.run = { ...state.run, status, finishedAt: new Date().toISOString(), ...detail };
    if (status === "failed") console.error("Agent run failed:", detail.error ?? `exit code ${detail.exitCode}`);
    else console.log("Agent run completed.");
  };
  child.once("error", (error) => finish("failed", { error: error.message }));
  child.once("exit", (code) => finish(code === 0 ? "passed" : "failed", { exitCode: code }));
}

async function waitForPendingHuman(timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!pendingHuman.profileId && Date.now() < deadline) await delay(100);
  return pendingHuman.profileId ? { profileId: pendingHuman.profileId, name: pendingHuman.name ?? "Human" } : undefined;
}

async function handle(request, response) {
  const url = new URL(request.url, `http://${HOST}:${PORT}`);
  if (request.method === "POST" && url.pathname === "/api/chat") {
    if (!isSameOrigin(request)) return sendJson(response, 403, { error: "Same-origin request required" });
    try {
      const body = await readJson(request);
      const runs = await listRuns();
      const run = typeof body.run === "string" ? body.run : "";
      const message = typeof body.message === "string" ? body.message.trim() : "";
      const agent = typeof body.agent === "string" ? body.agent : "";
      if (!isRunName(run) || !runs.some((item) => item.name === run)) return sendJson(response, 404, { error: "Run not found" });
      if (agent && !AGENT_NAMES.has(agent)) return sendJson(response, 400, { error: "Unknown agent" });
      if (!message || message.length > 1000) return sendJson(response, 400, { error: "Message must be 1-1000 characters" });
      const result = await answerAboutRun(run, message, Array.isArray(body.history) ? body.history : [], agent);
      return sendJson(response, 200, { answer: result.answer });
    } catch (error) {
      console.error("Run chat failed:", error);
      return sendJson(response, 503, { error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (request.method === "POST" && url.pathname === "/api/run") {
    if (!isSameOrigin(request)) return sendJson(response, 403, { error: "Same-origin request required" });
    if (state.runProcess || ["starting", "waiting-for-human"].includes(state.run.status)) return sendJson(response, 409, state.run);
    try {
      await readJson(request);
      const human = pendingHuman.profileId
        ? { profileId: pendingHuman.profileId, name: pendingHuman.name ?? "Human" }
        : registeredHuman.profileId
          ? { profileId: registeredHuman.profileId, name: registeredHuman.name ?? "Human" }
          : state.run.humanProfileId
            ? { profileId: state.run.humanProfileId, name: state.run.humanName ?? "Human" }
            : await waitForPendingHuman();
      delete pendingHuman.profileId;
      delete pendingHuman.name;
      await startRun(human?.profileId, human?.name);
      return sendJson(response, 202, state.run);
    } catch (error) {
      state.run = { ...state.run, status: "failed", error: error.message, finishedAt: new Date().toISOString() };
      console.error("Could not start agent test:", error);
      return sendJson(response, 503, state.run);
    }
  }
  if (url.pathname === "/api/join" && request.method === "OPTIONS") {
    if (!isQ3Origin(request)) return sendJson(response, 403, { error: "Q3 UI origin required" });
    return sendJoinJson(response, 204, {}, request.headers.origin);
  }
  if (url.pathname === "/api/join" && request.method === "POST") {
    if (!isQ3Origin(request)) return sendJson(response, 403, { error: "Q3 UI origin required" });
    if (["idle", "passed", "failed"].includes(state.run.status)) {
      try {
        const body = await readJson(request);
        if (typeof body.profileId !== "string" || !body.profileId.trim())
          return sendJoinJson(response, 400, { error: "profileId is required" }, request.headers.origin);
        pendingHuman.profileId = body.profileId.trim();
        pendingHuman.name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Human";
        await rememberHuman(pendingHuman.profileId, pendingHuman.name);
        return sendJoinJson(response, 202, { registered: true }, request.headers.origin);
      } catch (error) {
        return sendJoinJson(response, 400, { error: error instanceof Error ? error.message : String(error) }, request.headers.origin);
      }
    }
    if (!["running", "waiting-for-human"].includes(state.run.status)) return sendJoinJson(response, 409, { error: "No active test" }, request.headers.origin);
    try {
      const body = await readJson(request);
      if (typeof body.profileId !== "string" || !body.profileId.trim())
        return sendJoinJson(response, 400, { error: "profileId is required" }, request.headers.origin);
      const humanName = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Human";
      if (state.run.status === "waiting-for-human") {
        await rememberHuman(body.profileId.trim(), humanName);
        await startRun(body.profileId.trim(), humanName);
        return sendJoinJson(response, 202, state.run, request.headers.origin);
      }
      pendingHuman.profileId = body.profileId.trim();
      pendingHuman.name = humanName;
      await rememberHuman(pendingHuman.profileId, pendingHuman.name);
      return sendJoinJson(response, 202, { registered: true, nextRun: true }, request.headers.origin);
    } catch (error) {
      state.run = { ...state.run, status: "failed", error: error.message, finishedAt: new Date().toISOString() };
      return sendJoinJson(response, 503, state.run, request.headers.origin);
    }
  }
  if (url.pathname === "/api/human-event" && request.method === "OPTIONS") {
    if (!isQ3Origin(request)) return sendJson(response, 403, { error: "Q3 UI origin required" });
    return sendJoinJson(response, 204, {}, request.headers.origin);
  }
  if (url.pathname === "/api/human-event" && request.method === "POST") {
    if (!isQ3Origin(request)) return sendJson(response, 403, { error: "Q3 UI origin required" });
    if (state.run.status !== "running") return sendJoinJson(response, 409, { error: "No active human test" }, request.headers.origin);
    try {
      const body = await readJson(request);
      const questionId = typeof body.questionId === "string" ? body.questionId.trim() : "";
      const profileId = typeof body.profileId === "string" ? body.profileId.trim() : "";
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const answer = typeof body.answer === "string" ? body.answer.trim() : "";
      if (!questionId || (state.run.humanProfileId && profileId !== state.run.humanProfileId) || !title || !answer || answer.length > 500) {
        return sendJoinJson(response, 400, { error: "Invalid human answer event" }, request.headers.origin);
      }
      const runs = await listRuns();
      if (!runs[0]) return sendJoinJson(response, 409, { error: "Live run log is not ready" }, request.headers.origin);
      await appendFile(
        path.join(RUNS_DIR, runs[0].name),
        `[${new Date().toISOString().slice(11, 19)}] ${state.run.humanName ?? "Human"} answered [q:${questionId}] "${title}": ${answer}\n\n`
      );
      return sendJoinJson(response, 202, { accepted: true }, request.headers.origin);
    } catch (error) {
      return sendJoinJson(response, 400, { error: error instanceof Error ? error.message : String(error) }, request.headers.origin);
    }
  }
  if (url.pathname === "/api/run" && request.method === "GET" && isQ3Origin(request)) {
    return sendJoinJson(response, 200, state.run, request.headers.origin);
  }
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });

  if (url.pathname === "/favicon.ico") return send(response, 204, "image/x-icon", "");
  if (url.pathname === "/api/run") return sendJson(response, 200, state.run);
  if (url.pathname === "/api/runs") return sendJson(response, 200, { runs: await listRuns() });
  if (url.pathname === "/api/agents") return sendJson(response, 200, { oids: await getAgentOids() });
  if (url.pathname === "/api/log") {
    const runs = await listRuns();
    const requested = url.searchParams.get("run") ?? runs[0]?.name;
    if (!isRunName(requested) || !runs.some((run) => run.name === requested)) return sendJson(response, 404, { error: "Run not found" });
    const text = await readFile(path.join(RUNS_DIR, requested), "utf8");
    return sendJson(response, 200, { run: requested, text, mtime: runs.find((run) => run.name === requested).mtime });
  }
  if (url.pathname === "/api/report") {
    const run = url.searchParams.get("run");
    if (!isRunName(run)) return sendJson(response, 404, { error: "Run not found" });
    const text = await readFile(path.join(RUNS_DIR, run.replace(/\.chat\.md$/, ".md")), "utf8").catch(() => "");
    return sendJson(response, 200, { text });
  }
  if (url.pathname === "/api/network") {
    const run = url.searchParams.get("run");
    const runs = await listRuns();
    if (!isRunName(run) || !runs.some((item) => item.name === run)) return sendJson(response, 404, { error: "Run not found" });
    return sendJson(response, 200, { networks: await getRunNetwork(run) });
  }
  const staticFile = STATIC_FILES[url.pathname];
  if (!staticFile) return sendJson(response, 404, { error: "Not found" });
  const directory = staticFile[0] === "index.html" ? SOURCE_VIEWER_DIR : VIEWER_DIR;
  return send(response, 200, staticFile[1], await readFile(path.join(directory, staticFile[0])));
}

async function selfCheck() {
  const child = spawnPnpm(["--version"], REPO_DIR);
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pnpm launcher exited with code ${code}`));
    });
  });
  const { classifyFinding, parseLine, parseLog, parseReport, questionTopic } = await import("./viewer-data.mjs");
  const { profileKind } = await import("./viewer-profiles.mjs");
  const { groupQuestions } = await import("./viewer-questions.mjs");
  assert.equal(isRunName("../secret.chat.md"), false);
  assert.equal(isSameOrigin({ headers: { origin: `http://${HOST}:${PORT}` } }), true);
  assert.equal(isSameOrigin({ headers: { origin: "https://example.com" } }), false);
  assert.equal(isQ3Origin({ headers: { origin: "http://localhost:5183" } }), true);
  assert.equal(isQ3Origin({ headers: { origin: "https://example.com" } }), false);
  assert.deepEqual(parseLine('[03:44:11] Mike answered "A useful question": A useful answer'), {
    time: "03:44:11",
    agent: "Mike",
    kind: "answer",
    text: 'answered "A useful question": A useful answer',
  });
  assert.deepEqual(parseLine('[03:44:11] Mike answered [q:q-1] "A useful question": A useful answer'), {
    time: "03:44:11",
    agent: "Mike",
    kind: "answer",
    text: 'answered "A useful question": A useful answer',
    questionId: "q-1",
  });
  assert.equal(
    parseLog('[03:44:11] Mike answered "A useful question": First paragraph\n\nSecond paragraph\n[03:44:12] Bella looked at /sharedQuestions\n')[0].text,
    'answered "A useful question": First paragraph\n\nSecond paragraph'
  );
  assert.equal(parseLine('[03:44:13] Ian edited "A useful question"').kind, "edit");
  assert.equal(parseLog('[03:44:10] Run starts. Online: Mike, Josh.\n\n[03:44:13] Josh answered "A useful question": Yes')[1].agent, "Josh");
  assert.equal(profileKind("Josh"), "Human");
  assert.equal(classifyFinding("permission allowed unauthorized access"), "Security");
  assert.equal(classifyFinding("answer profile was misattributed"), "Data");
  assert.equal(questionTopic({ title: "Where do you live?", text: "Choose your city" }), "Location");
  assert.equal(questionTopic({ title: "What do you do for fun?", text: "Choose one hobby" }), "Interests");
  const grouped = groupQuestions(
    [
      { agent: "", kind: "start", questionId: undefined, participants: ["Eric", "Bella", "Ian"], text: "Run starts. Online: Eric, Bella, Ian." },
      { agent: "Eric", kind: "share", questionId: "q-1", text: 'shared "Where do you live?" with Bella, Ian' },
      { agent: "Bella", kind: "answer", questionId: "q-1", text: 'answered "Where do you live?": Melbourne' },
    ],
    [
      { id: "q-1", title: "Where do you live?", owner: "Eric", text: "", answers: [{ author: "Unknown", text: "Melbourne" }] },
      {
        id: "q-2",
        title: "Where do you live?",
        owner: "Bella",
        text: "",
        answers: [
          { author: "Eric", text: "Taipei" },
          { author: "Mike", text: "Seoul" },
        ],
      },
    ]
  );
  assert.deepEqual(
    grouped.map(({ id, answers }) => ({ id, answers })),
    [
      { id: "q-1", answers: [{ author: "Bella", text: "Melbourne" }] },
      {
        id: "q-2",
        answers: [
          { author: "Eric", text: "Taipei" },
          { author: "Mike", text: "Seoul" },
        ],
      },
    ]
  );
  assert.deepEqual(
    grouped.map(({ id, sharedWith }) => ({ id, sharedWith })),
    [
      { id: "q-1", sharedWith: ["Bella", "Ian"] },
      { id: "q-2", sharedWith: [] },
    ]
  );
  const anonymousRecipients = groupQuestions(
    [
      { agent: "", kind: "start", participants: ["Mike", "Ian", "Eric"], text: "Run starts. Online: Mike, Ian, Eric." },
      { agent: "Mike", kind: "share", questionId: "q-3", text: 'shared "Where do you live?" with Person 1, Person 2' },
    ],
    [
      {
        id: "q-3",
        title: "Where do you live?",
        owner: "Mike",
        text: "",
        answers: [
          { author: "Ian", text: "Cape Town" },
          { author: "Eric", text: "Taipei" },
        ],
      },
    ]
  );
  assert.deepEqual(anonymousRecipients[0].sharedWith, ["Ian", "Eric"]);
  const result = parseReport(
    "## Metrics\n\n| Agent | Steps | New questions | Edits | Shares | Re-shares | Answered / others' seen |\n|---|---|---|---|---|---|---|\n| Mike | 2 | 1 | 0 | 1 | 1 | 1/2 |\n\n## Judge\n\n| Observer | Subject | Accuracy /10 | Hidden links found | Note |\n|---|---|---|---|---|\n| Mike | Bella | 8 | - | Accurate |\n\n### Leaks\n\n- none\n\n## Findings"
  );
  assert.deepEqual(
    { average: result.average, questions: result.questions, reshares: result.reshares, details: result.pairs[0].detailsAvailable },
    { average: 8, questions: 1, reshares: 1, details: false }
  );
  const details = parseReport(
    '## Metrics\n\n| Agent | Steps | New questions | Edits | Shares | Re-shares | Answered / others\' seen |\n|---|---|---|---|---|---|---|\n\n## Judge\n\n| Observer | Subject | Accuracy /10 | Hidden links found | Correct facts | Incorrect facts | Missing facts | Stored memory | Note |\n|---|---|---|---|---|---|---|---|---|\n| Mike | Eric | 6 | Game | ["Taipei"] | ["Age 40"] | ["Work"] | "### Facts\\n- Taipei" | Mixed |\n\n### Leaks\n\n- none\n\n## Findings'
  ).pairs[0];
  assert.deepEqual(
    { available: details.detailsAvailable, correct: details.correctFacts, wrong: details.incorrectFacts, memory: details.memory },
    { available: true, correct: ["Taipei"], wrong: ["Age 40"], memory: "### Facts\n- Taipei" }
  );
  assert.deepEqual(
    parseReport(
      "## Participant profiles\n\n| Participant | Profile ID |\n|---|---|\n| Mike | mike-id |\n\n## Metrics\n\n| Agent | Steps | New questions | Edits | Shares | Re-shares | Answered / others' seen |\n|---|---|---|---|---|---|---|\n\n## Judge\n\n### Leaks\n\n- none"
    ).profileIds,
    { Mike: "mike-id" }
  );
  const answer = parseReport(
    "## Questions (final)\n\n### Where? (id q-1; owner Mike)\n\nWhere do you live?\nOptions: Brisbane\n- Bella: Brisbane\n\n## Call log"
  ).questionList[0].answers[0];
  assert.deepEqual(answer, { author: "Bella", text: "Brisbane" });
  assert.equal(parseLine("not an event"), null);
  console.log("Agent viewer self-check passed.");
}

await loadRegisteredHuman();

if (process.argv.includes("--check")) {
  await selfCheck();
} else {
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error("AGENT_VIEW_PORT must be a valid port");
  const server = createServer((request, response) =>
    handle(request, response).catch((error) => {
      console.error(error);
      sendJson(response, 500, { error: "Viewer error" });
    })
  );
  server.listen(PORT, HOST, () => {
    console.log(`Q3 Agent Lab: http://${HOST}:${PORT}`);
    console.log("Waiting for New test in the viewer. Test output will stream to this terminal.");
  });
}
