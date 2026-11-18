/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { appendFile, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { initRepository } from "quest3Tier/dist/repository/table/repository.mjs";
import questContainer from "quest3Tier/dist/di/diContainer.mjs";
import { createAgentOperations } from "./agent-operations.mjs";
import { toExternalProfileId } from "quest3Tier/dist/handler/profileId.mjs";
import { NAMES } from "../agentChat.config.mjs";
import { isLocalAzurite } from "../agentChat.reset.mjs";
import { getLlmModel, loadRuntimeSettings } from "../agentChat.llm.mjs";
import { createRefereeContextBuilder } from "../agentChat.referee-context.mjs";
import { sendLiveChat } from "../agentChat.live.mjs";
import { createActivityRepository } from "../activity/activity-repository.mjs";
import { answerResults, readAgentMemory, greetingReply } from "./results-chat.mjs";
import { answerRefereeChat } from "./referee-chat.mjs";

const VIEWER_DIR = path.dirname(fileURLToPath(import.meta.url));
const viewerParent = path.resolve(VIEWER_DIR, "..");
const DASHBOARD_DIR = path.basename(viewerParent) === "dist" ? path.resolve(VIEWER_DIR, "../..") : viewerParent;
const SOURCE_VIEWER_DIR = path.join(DASHBOARD_DIR, "viewer");
const RUNS_DIR = path.join(DASHBOARD_DIR, "runs");
const REPO_DIR = path.resolve(DASHBOARD_DIR, "../..");
const RUN_SCRIPT = path.join(DASHBOARD_DIR, "dist/agentChat.run.mjs");
const AZURITE_BIN = path.join(REPO_DIR, "node_modules/azurite/dist/src/azurite.js");
const AG_GRID_JS = path.resolve(path.dirname(fileURLToPath(import.meta.resolve("ag-grid-community"))), "../ag-grid-community.min.js");
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
const tableRepositoryState: { value?: Promise<ReturnType<typeof initRepository>> } = {};
const pendingHuman: { profileId?: string; name?: string } = {};
const registeredHuman: { profileId?: string; name?: string } = {};
const HUMAN_STATE_PATH = path.join(RUNS_DIR, ".human.json");
const activityRepository = createActivityRepository(process.env.ACTIVITY_DB_PATH ?? path.join(DASHBOARD_DIR, "activity.lancedb"));
let resultsChatPending = false;
let refereeChatPending = false;
let agentOperations: ReturnType<typeof createAgentOperations> | undefined;

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
  return loadRuntimeSettings(CHILD_ENV);
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

async function getQuestionsForAgent(name: string, externalId = toExternalProfileId) {
  if (!AGENT_NAMES.has(name)) throw new Error("Unknown agent");
  const profileId = await resolveQuestProfileId((await getAgentOids())[name]);
  const repository = await getTableRepository();
  const list = await repository.getCombinationListByUser(profileId);
  if (!Array.isArray(list)) throw new Error("Quest repository returned an invalid question list");
  return Promise.all(list.map(async (question) => ({
    ...question,
    profileId: await externalId(question.profileId),
    latestAnswer: question.latestAnswer && {
      ...question.latestAnswer,
      profileId: await externalId(question.latestAnswer.profileId),
    },
    isOwner: question.profileId === profileId,
  })));
}

async function getAnswersForAgent(name: string, questionId: string, externalId = toExternalProfileId) {
  if (!AGENT_NAMES.has(name)) throw new Error("Unknown agent");
  const questions = await getQuestionsForAgent(name, externalId);
  if (!questions.some((question) => question && typeof question === "object" && "id" in question && question.id === questionId)) return undefined;
  const repository = await getTableRepository();
  const list = await repository.getAnswerListByQuestionId(questionId);
  if (!Array.isArray(list)) throw new Error("Quest repository returned an invalid answer list");
  if (list.some((answer) => !answer || typeof answer !== "object" || answer.questionId !== questionId)) {
    throw new Error("Quest repository returned data for a different question");
  }
  const participants = Object.entries(await getAgentOids());
  if (registeredHuman.profileId) participants.push([registeredHuman.name ?? "Participant", registeredHuman.profileId]);
  const namesByProfileId = new Map<string, string>();
  for (const [name, oid] of participants) {
    const profile = await repository.findProfileByExternalId(oid);
    if (profile) namesByProfileId.set(profile.id, name);
  }
  return list.map((answer) => ({
    ...answer,
    answeredBy: namesByProfileId.get(answer.profileId) ?? "Unknown participant",
    isEdited: (answer.answerCount ?? 0) > 1,
    answerCount: undefined,
    profileId: undefined,
  }));
}

async function readRefereeApi(actor: string, apiPath: string, externalId = toExternalProfileId) {
  if (apiPath === "/questions") return getQuestionsForAgent(actor, externalId);
  const answers = apiPath.match(/^\/question\/([A-Za-z0-9-]+)\/answers$/);
  if (answers) return getAnswersForAgent(actor, answers[1], externalId);
  throw new Error(`Referee API path is not implemented: ${apiPath}`);
}

const buildRefereeContext = createRefereeContextBuilder({ dashboardDir: DASHBOARD_DIR, repositoryDir: REPO_DIR, activity: activityRepository, readApi: readRefereeApi });

const spawnPnpm = (args: string[], cwd: string, env = CHILD_ENV) =>
  spawn(process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "pnpm", process.platform === "win32" ? ["/d", "/s", "/c", "pnpm", ...args] : args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

const isRunName = (name) => typeof name === "string" && path.basename(name) === name && name.endsWith(".chat.md");

async function listRuns() {
  const hasReport = (name: string) => stat(path.join(RUNS_DIR, name.replace(/\.chat\.md$/, ".md"))).then(() => true, () => false);
  const entries = await readdir(RUNS_DIR, { withFileTypes: true }).catch(() => []);
  const runs = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && isRunName(entry.name))
      .map(async (entry) => ({
        name: entry.name,
        mtime: (await stat(path.join(RUNS_DIR, entry.name))).mtimeMs,
        completed: await hasReport(entry.name),
      }))
  );
  const combined = new Map(runs.map((run) => [run.name, run]));
  for (const run of await activityRepository.listRuns()) {
    const current = combined.get(run.name);
    if (!current || run.mtime > current.mtime) combined.set(run.name, { ...run, completed: current?.completed ?? await hasReport(run.name) });
  }
  return [...combined.values()].sort((a, b) => b.mtime - a.mtime);
}

async function getTableRepository(loadSettings = localSettings, initialize = initRepository) {
  if (!tableRepositoryState.value) {
    tableRepositoryState.value = (async () => {
      const settings = await loadSettings();
      const storage = {
        allowReadSideEffects: false,
        AzureWebJobsStorage: process.env.AzureWebJobsStorage ?? settings.AzureWebJobsStorage,
        AzureWebJobsStorage__tableServiceUri: process.env.AzureWebJobsStorage__tableServiceUri ?? settings.AzureWebJobsStorage__tableServiceUri,
        AzureWebJobsStorage__clientId: process.env.AzureWebJobsStorage__clientId ?? settings.AzureWebJobsStorage__clientId,
      };
      if (![storage.AzureWebJobsStorage, storage.AzureWebJobsStorage__tableServiceUri]
        .some((value) => typeof value === "string" && value.trim())) {
        throw new Error("Dashboard Quest storage is not configured: set AzureWebJobsStorage or AzureWebJobsStorage__tableServiceUri.");
      }
      return initialize(storage);
    })();
  }
  return tableRepositoryState.value;
}

async function resolveQuestProfileId(externalId: string): Promise<string> {
  const repository = await getTableRepository();
  const profile = await repository.findProfileByExternalId(externalId);
  if (!profile) throw new Error(`Quest profile not found for external ID: ${externalId}`);
  return profile.id;
}

async function getRunNetwork(run: string, externalId = toExternalProfileId, readReport: (file: string, encoding: "utf8") => Promise<string> = readFile) {
  const { parseReport } = await import("./viewer-data.mjs");
  const text = await readReport(path.join(RUNS_DIR, run.replace(/\.chat\.md$/, ".md")), "utf8").catch(() => "");
  const profileIds = parseReport(text).profileIds;
  if (!Object.keys(profileIds).length) return {};
  const repository = await getTableRepository();
  const networks = await Promise.all(Object.entries(profileIds).map(async ([name, profileId]) => {
    const friends = await repository.listFriends(await resolveQuestProfileId(profileId));
    return [name, await Promise.all(friends.map(async (friend) => ({
      ...friend,
      id: await externalId(friend.id),
      path: await Promise.all(friend.path.map(externalId)),
    })))];
  }));
  return Object.fromEntries(networks);
}

function send(response, status, contentType, body) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; img-src 'self' data:",
    "Content-Type": contentType,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

const sendJson = (response, status, body) => send(response, status, "application/json; charset=utf-8", JSON.stringify(body));
const isSameOrigin = (request) => request.headers.origin === `http://${HOST}:${PORT}`;
const isQuestUiOrigin = (request) => ["http://localhost:5186", "http://127.0.0.1:5186"].includes(request.headers.origin ?? "");
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

const chatModel = (env: NodeJS.ProcessEnv, fallback = "") => getLlmModel("CHAT", env, fallback);

async function readJson(request) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

async function answerAboutRun(run: string, message: string, history: unknown[], agent = "") {
  if (agent) {
    if (state.runProcess && state.run.status === "running") {
      try {
        return await sendLiveChat(path.join(RUNS_DIR, run), agent, message);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
    }
    const agentFile = await readFile(path.join(DASHBOARD_DIR, agent, `${agent}.agent.md`), "utf8");
    const match = agentFile.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) throw new Error(`Invalid agent profile for ${agent}`);
    const model = match[1].match(/^model:\s*(\S+)\s*$/m)?.[1] ?? "";
    const memory = await readAgentMemory(path.join(DASHBOARD_DIR, agent));
    const report = await readFile(path.join(RUNS_DIR, run.replace(/\.chat\.md$/, ".md")), "utf8").catch(() => "");
    const legacyChat = await readFile(path.join(RUNS_DIR, run), "utf8").catch(() => "");
    const structuredEvents = legacyChat ? [] : await activityRepository.listByRun(run);
    const chat = legacyChat || structuredEvents.map((event) =>
      `[${event.occurredAt}] ${event.actorName ?? "System"} ${event.eventType} ${JSON.stringify(event.eventData)}`
    ).join("\n");
    const env = await localSettings();
    return answerResults(
      {
        systemPrompt: `You are ${agent}. Stay in character using the supplied persona, saved relationship memory and completed Q3 run. Continue the conversation naturally. Do not call tools, claim to perform Q3 actions, or reveal private persona facts that your disclosure rules prohibit.`,
        input: {
          message,
          history: history.slice(-12),
          persona: match[2].slice(0, 12000),
          memory: memory.slice(-12000),
          report: report.slice(-20000),
          runChat: chat.slice(-12000),
        },
        model: chatModel(env, model),
        schema: CHAT_SCHEMA,
        sandbox: RUNS_DIR,
        options: { effort: "low", thinking: false, maxTokens: 512 },
      },
      env
    );
  }
  if (state.runProcess || ["starting", "waiting-for-human"].includes(state.run.status)) {
    throw new Error("The results assistant is available after the run ends. Select an active agent to chat during the run.");
  }
  if (resultsChatPending) throw new Error("The results assistant is already answering a message.");
  resultsChatPending = true;
  try {
    const report = await readFile(path.join(RUNS_DIR, run.replace(/\.chat\.md$/, ".md")), "utf8").catch(() => "");
    const chat = await readFile(path.join(RUNS_DIR, run), "utf8").catch(() => "");
    const env = await localSettings();
    return await answerResults(
      {
        systemPrompt:
          "You are the Q3 Agent Lab results assistant. Answer only from the supplied run report and chat log. Explain evidence and uncertainty plainly. Do not invent events, scores or people. Keep the answer concise.",
        input: { question: message, history: history.slice(-8), report: report.slice(-30000), chat: chat.slice(-20000) },
        model: chatModel(env),
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

async function ensureServices(loadSettings = localSettings, checkPort = portOpen) {
  await getTableRepository(loadSettings);
  const settings = await loadSettings();
  if (isLocalAzurite(settings.AzureWebJobsStorage ?? "") && !(await checkPort(10002))) {
    state.azuriteProcess = spawn(process.execPath, [AZURITE_BIN, "--location", REPO_DIR, "--tableHost", HOST, "--tablePort", "10002", "--silent"], {
      cwd: REPO_DIR,
      env: CHILD_ENV,
      stdio: ["ignore", "pipe", "pipe"],
    });
    state.azuriteProcess.stdout?.pipe(process.stdout);
    state.azuriteProcess.stderr?.pipe(process.stderr);
    if (!(await waitForPort(10002, HOST, 50))) throw new Error("Azurite Table did not start on port 10002");
  }
}

async function startRun(humanProfileId?: string, humanName = "Human") {
  if (resultsChatPending) throw new Error("Wait for the results assistant to finish before starting another run.");
  const humanMode = Boolean(humanProfileId);
  state.run = { status: "starting", humanMode, ...(humanProfileId && { humanProfileId, humanName }), startedAt: new Date().toISOString() };
  console.log(`Starting agent run${humanMode ? " with a Q3 human participant" : ""}...`);
  await ensureServices();
  questContainer.register("repository", await getTableRepository());
  const operations = createAgentOperations(await getAgentOids());
  agentOperations = operations;
  const childEnv = { ...(await localSettings()), AGENT_RUN: "1",
    DASHBOARD_URL: `http://${HOST}:${PORT}`, AGENT_EXECUTION_TOKENS: JSON.stringify(operations.tokens) };
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
    operations.close();
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
  if (request.method === "POST" && url.pathname === "/api/agent") {
    const supplied = request.headers["x-correlation-id"];
    const correlationId = typeof supplied === "string" && /^[\w-]{1,128}$/.test(supplied) ? supplied : randomUUID();
    response.setHeader("X-Correlation-Id", correlationId);
    try {
      if (!agentOperations) return sendJson(response, 403, { message: "Active agent execution required" });
      return sendJson(response, 200, await agentOperations.execute(request.headers.authorization, await readJson(request), correlationId));
    } catch (error) {
      return sendJson(response, error.status ?? (error.name === "ZodError" || error instanceof SyntaxError ? 400 : 500), { message: error.message });
    }
  }
  if (request.method === "POST" && url.pathname === "/api/referee-chat") {
    if (!isSameOrigin(request)) return sendJson(response, 403, { error: "Same-origin request required" });
    if (refereeChatPending) return sendJson(response, 409, { error: "Referee is already answering a message" });
    try {
      const body = await readJson(request);
      const runs = await listRuns();
      const run = typeof body.run === "string" ? body.run : "";
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!isRunName(run) || !runs.some((item) => item.name === run)) return sendJson(response, 404, { error: "Run not found" });
      if (!message || message.length > 1000) return sendJson(response, 400, { error: "Message must be 1-1000 characters" });
      if (body.scope !== undefined && !["selected-run", "all-runs"].includes(body.scope)) return sendJson(response, 400, { error: "Invalid run scope" });
      const greeting = greetingReply(message);
      if (greeting) return sendJson(response, 200, { answer: greeting, evidence: { scope: body.scope ?? "selected-run", activity: [], memories: [], repository: [], api: [] } });
      refereeChatPending = true;
      const context = await buildRefereeContext({ runId: run, question: message, scope: body.scope, apiRequests: NAMES.map((actor) => ({ actor, path: "/questions" })) });
      const env = await localSettings();
      const result = await answerRefereeChat({ message, history: body.history, context, model: getLlmModel("REFEREE", env, env.JUDGE_MODEL ?? ""), env });
      return sendJson(response, 200, result);
    } catch (error) {
      console.error("Referee chat failed:", error);
      return sendJson(response, 503, { error: error instanceof Error ? error.message : String(error) });
    } finally {
      refereeChatPending = false;
    }
  }
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
      const greeting = greetingReply(message);
      if (greeting) return sendJson(response, 200, { answer: greeting });
      const result = await answerAboutRun(run, message, Array.isArray(body.history) ? body.history : [], agent);
      return sendJson(response, 200, { answer: result.answer });
    } catch (error) {
      console.error("Run chat failed:", error);
      return sendJson(response, 503, { error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (request.method === "POST" && url.pathname === "/api/answers") {
    if (!isSameOrigin(request)) return sendJson(response, 403, { error: "Same-origin request required" });
    try {
      const body = await readJson(request);
      const person = typeof body.person === "string" ? body.person : "";
      const questionId = typeof body.questionId === "string" ? body.questionId.trim() : "";
      if (!AGENT_NAMES.has(person)) return sendJson(response, 400, { error: "Select a known agent" });
      if (!questionId) return sendJson(response, 400, { error: "Question ID is required" });
      const answers = await getAnswersForAgent(person, questionId);
      if (!answers) return sendJson(response, 403, { error: "Question is not accessible to this person" });
      const activity = await activityRepository.listByQuestion(questionId);
      const runStarts = (await Promise.all([...new Set(activity.map((event) => event.runId))].map((runId) => activityRepository.listByRun(runId))))
        .flat()
        .filter((event) => event.eventType === "run.started");
      return sendJson(response, 200, { answers, activity: [...runStarts, ...activity] });
    } catch (error) {
      console.error("Could not load answers:", error);
      return sendJson(response, 502, { error: error instanceof Error ? error.message : String(error) });
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
    if (!isQuestUiOrigin(request)) return sendJson(response, 403, { error: "Q5EG UI origin required" });
    return sendJoinJson(response, 204, {}, request.headers.origin);
  }
  if (url.pathname === "/api/join" && request.method === "POST") {
    if (!isQuestUiOrigin(request)) return sendJson(response, 403, { error: "Q5EG UI origin required" });
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
    if (!isQuestUiOrigin(request)) return sendJson(response, 403, { error: "Q5EG UI origin required" });
    return sendJoinJson(response, 204, {}, request.headers.origin);
  }
  if (url.pathname === "/api/human-event" && request.method === "POST") {
    if (!isQuestUiOrigin(request)) return sendJson(response, 403, { error: "Q5EG UI origin required" });
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
  if (url.pathname === "/api/run" && request.method === "GET" && isQuestUiOrigin(request)) {
    return sendJoinJson(response, 200, state.run, request.headers.origin);
  }
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });

  if (url.pathname === "/favicon.ico") return send(response, 204, "image/x-icon", "");
  if (url.pathname === "/vendor/ag-grid.js") return send(response, 200, "text/javascript; charset=utf-8", await readFile(AG_GRID_JS));
  if (url.pathname === "/api/run") return sendJson(response, 200, state.run);
  if (url.pathname === "/api/questions") {
    const person = url.searchParams.get("person") ?? "";
    if (!AGENT_NAMES.has(person)) return sendJson(response, 400, { error: "Select a known agent" });
    try {
      return sendJson(response, 200, { questions: await getQuestionsForAgent(person) });
    } catch (error) {
      console.error(`Could not load questions for ${person}:`, error);
      return sendJson(response, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (url.pathname === "/api/runs") return sendJson(response, 200, { runs: await listRuns() });
  if (url.pathname === "/api/agents") return sendJson(response, 200, { oids: await getAgentOids() });
  if (url.pathname === "/api/activity") {
    const runs = await listRuns();
    const requestedRun = url.searchParams.get("run");
    if (!requestedRun && url.searchParams.get("scope") === "all") {
      const activityRuns = await Promise.all(
        runs.map(async (run) => {
          const events = await activityRepository.listByRun(run.name);
          const legacyText = events.length ? "" : await readFile(path.join(RUNS_DIR, run.name), "utf8").catch(() => "");
          return { runId: run.name, events, legacyText };
        })
      );
      return sendJson(response, 200, { runs: activityRuns, mtime: Math.max(0, ...runs.map((run) => run.mtime)) });
    }
    const requested = requestedRun ?? runs[0]?.name;
    if (!isRunName(requested) || !runs.some((run) => run.name === requested)) return sendJson(response, 404, { error: "Run not found" });
    const events = await activityRepository.listByRun(requested);
    if (events.length) return sendJson(response, 200, { run: requested, events, mtime: runs.find((run) => run.name === requested)?.mtime ?? 0 });
    const legacyText = await readFile(path.join(RUNS_DIR, requested), "utf8").catch(() => "");
    return sendJson(response, 200, { run: requested, events: [], legacyText, mtime: runs.find((run) => run.name === requested)?.mtime ?? 0 });
  }
  if (url.pathname === "/api/log") {
    const runs = await listRuns();
    const requested = url.searchParams.get("run") ?? runs[0]?.name;
    if (!isRunName(requested) || !runs.some((run) => run.name === requested)) return sendJson(response, 404, { error: "Run not found" });
    const text = await readFile(path.join(RUNS_DIR, requested), "utf8").catch(() => "");
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
    try {
      return sendJson(response, 200, { networks: await getRunNetwork(run) });
    } catch (error) {
      console.error("Could not load network:", error);
      return sendJson(response, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  }
  const staticFile = STATIC_FILES[url.pathname];
  if (!staticFile) return sendJson(response, 404, { error: "Not found" });
  const directory = staticFile[0] === "index.html" ? SOURCE_VIEWER_DIR : VIEWER_DIR;
  return send(response, 200, staticFile[1], await readFile(path.join(directory, staticFile[0])));
}

async function selfCheck() {
  const storageKeys = ["AzureWebJobsStorage", "AzureWebJobsStorage__tableServiceUri", "AzureWebJobsStorage__clientId"];
  const savedStorage = storageKeys.map((key) => process.env[key]);
  try {
    for (const key of storageKeys) delete process.env[key];
    await assert.rejects(() => getTableRepository(async () => ({})), /Quest storage is not configured/);
    tableRepositoryState.value = undefined;
    const settings = { AzureWebJobsStorage: "UseDevelopmentStorage=true" };
    let initializations = 0;
    const initialize = (storage) => {
      initializations++;
      assert.deepEqual(storage, { ...settings, allowReadSideEffects: false, AzureWebJobsStorage__tableServiceUri: undefined, AzureWebJobsStorage__clientId: undefined });
      return initRepository(storage);
    };
    const [repository, concurrent] = await Promise.all([
      getTableRepository(async () => settings, initialize),
      getTableRepository(async () => { throw new Error("Settings loaded twice"); }, initialize),
    ]);
    assert.equal(repository, concurrent);
    assert.equal(await getTableRepository(), repository);
    assert.equal(initializations, 1);
    for (const storage of [
      { AzureWebJobsStorage: "DefaultEndpointsProtocol=https;AccountName=test;AccountKey=test" },
      { AzureWebJobsStorage__tableServiceUri: "https://example.table.core.windows.net" },
      { AzureWebJobsStorage: "TableEndpoint=http://127.0.0.1:11002/test;AccountName=test;AccountKey=test" },
    ]) {
      await ensureServices(async () => storage, async () => { throw new Error("Configured storage must not start default Azurite"); });
    }
    let portChecks = 0;
    await ensureServices(async () => settings, async (port) => {
      assert.equal(port, 10002);
      portChecks++;
      return true;
    });
    assert.equal(portChecks, 1);
    const findProfile = repository.findProfileByExternalId;
    try {
      repository.findProfileByExternalId = async (externalId) => {
        assert.equal(externalId, "external-test-id");
        return { id: "internal-test-id", externalId };
      };
      assert.equal(await resolveQuestProfileId("external-test-id"), "internal-test-id");
      repository.findProfileByExternalId = async () => null;
      await assert.rejects(() => resolveQuestProfileId("missing"), /Quest profile not found/);
      repository.findProfileByExternalId = async () => { throw new Error("Storage unavailable"); };
      await assert.rejects(() => resolveQuestProfileId("external-test-id"), /Storage unavailable/);
    } finally {
      repository.findProfileByExternalId = findProfile;
    }
    tableRepositoryState.value = undefined;
    await assert.rejects(() => getTableRepository(async () => settings, () => {
      throw new Error("Initialization failed");
    }), /Initialization failed/);
    await assert.rejects(() => getTableRepository(), /Initialization failed/);
  } finally {
    tableRepositoryState.value = undefined;
    storageKeys.forEach((key, index) => {
      if (savedStorage[index] === undefined) delete process.env[key];
      else process.env[key] = savedStorage[index];
    });
  }
  const child = spawnPnpm(["--version"], REPO_DIR);
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pnpm launcher exited with code ${code}`));
    });
  });
  const { classifyFinding, parseLine, parseLog, parseReport, presentLegacyActivityEvents, questionTopic, redactSecrets } = await import("./viewer-data.mjs");
  assert.deepEqual(redactSecrets({ title: "Pets", apiKey: "abc", nested: [{ token: "x" }], reason: "Bearer abc.def failed" }), {
    title: "Pets",
    apiKey: "[redacted]",
    nested: [{ token: "[redacted]" }],
    reason: "[redacted] failed",
  });
  const { profileKind } = await import("./viewer-profiles.mjs");
  const { groupQuestions } = await import("./viewer-questions.mjs");
  assert.equal(isRunName("../secret.chat.md"), false);
  assert.equal(isSameOrigin({ headers: { origin: `http://${HOST}:${PORT}` } }), true);
  assert.equal(isSameOrigin({ headers: { origin: "https://example.com" } }), false);
  assert.equal(isQuestUiOrigin({ headers: { origin: "http://localhost:5186" } }), true);
  assert.equal(isQuestUiOrigin({ headers: { origin: "https://example.com" } }), false);
  const agentOids = await getAgentOids();
  const repository = await getTableRepository();
  const originalRepository = { ...repository };
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error("Viewer must not call Quest HTTP"); };
    repository.findProfileByExternalId = async (oid) => {
      const name = Object.keys(agentOids).find((name) => agentOids[name] === oid);
      return name ? { id: `internal-${name}`, externalId: oid } : null;
    };
    const externalId = async (id: string) => {
      const oid = agentOids[id.replace("internal-", "")];
      if (!oid) throw new Error("Current Quest profile not found");
      return oid;
    };
    const answer = { id: "a-1", questionId: "q-1", profileId: "internal-Mike", answerText: "Yes",
      optionAnswerList: null, when: null, duration: 1, createdAt: "2026-11-16T00:00:00Z", answerCount: 2 };
    repository.getCombinationListByUser = async (id) => {
      assert.equal(id, "internal-Mike");
      return [
        { id: "q-1", profileId: id, title: "Owned", questionText: "Question?", optionList: null, createdAt: answer.createdAt, latestAnswer: answer },
        { id: "q-2", profileId: "internal-Bella", title: "Shared", questionText: "Question?", optionList: null, createdAt: answer.createdAt, latestAnswer: null },
      ];
    };
    let answerReads = 0;
    repository.getAnswerListByQuestionId = async () => {
      answerReads++;
      return [answer, { ...answer, id: "a-2", profileId: "unknown-author", answerCount: 1 }];
    };
    const questions = await readRefereeApi("Mike", "/questions", externalId);
    assert.equal(questions[0].profileId, agentOids.Mike);
    assert.equal(questions[0].latestAnswer.profileId, agentOids.Mike);
    assert.equal(questions[0].isOwner, true);
    assert.equal(questions[1].profileId, agentOids.Bella);
    assert.equal(questions[1].isOwner, false);
    const answers = await readRefereeApi("Mike", "/question/q-1/answers", externalId);
    assert.equal(answers[0].answeredBy, "Mike");
    assert.equal(answers[0].isEdited, true);
    assert.equal(answers[0].profileId, undefined);
    assert.equal(answers[0].answerCount, undefined);
    assert.equal(answers[1].answeredBy, "Unknown participant");
    assert.equal(answers[1].isEdited, false);
    assert.equal(await getAnswersForAgent("Mike", "unrelated", externalId), undefined);
    assert.equal(answerReads, 1);
    repository.getAnswerListByQuestionId = async () => [{ ...answer, questionId: "wrong" }];
    await assert.rejects(() => getAnswersForAgent("Mike", "q-1", externalId), /different question/);
    repository.listFriends = async (id) => {
      assert.equal(id, "internal-Mike");
      return [{ id: "internal-Bella", name: "Bella", degree: 1, path: [id, "internal-Bella"] }];
    };
    const report = async () => `## Participant profiles\n\n| Participant | Profile ID |\n|---|---|\n| Mike | ${agentOids.Mike} |\n\n## Metrics\n`;
    const network = await getRunNetwork("historical.chat.md", externalId, report);
    assert.deepEqual(network.Mike, [{ id: agentOids.Bella, name: "Bella", degree: 1, path: [agentOids.Mike, agentOids.Bella] }]);
    assert.deepEqual(await getRunNetwork("empty.chat.md", externalId, async () => ""), {});
    repository.findProfileByExternalId = async () => null;
    await assert.rejects(() => getQuestionsForAgent("Mike", externalId), /Quest profile not found/);
    await assert.rejects(() => getRunNetwork("historical.chat.md", externalId, report), /Quest profile not found/);
    repository.findProfileByExternalId = async () => { throw new Error("Storage unavailable"); };
    await assert.rejects(() => getQuestionsForAgent("Mike", externalId), /Storage unavailable/);
  } finally {
    Object.assign(repository, originalRepository);
    globalThis.fetch = originalFetch;
  }
  assert.equal(chatModel({ LLM_PROVIDER: "claude", CLAUDE_MODEL: "claude-haiku", LLM_MODEL: "local-path" }), "claude-haiku");
  assert.equal(chatModel({ LLM_PROVIDER: "openai", OPENAI_MODEL: "gpt-test" }), "gpt-test");
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
  assert.deepEqual(
    presentLegacyActivityEvents('[03:44:13] Mike answered [q:q-1] "A useful question": Yes', "run-1", { Mike: "agent-1" })[0],
    {
      time: "03:44:13", agent: "Mike", kind: "answer", text: 'answered "A useful question": Yes', questionId: "q-1",
      id: "run-1:legacy:0", runId: "run-1", aggregateType: "question", aggregateId: "q-1", legacy: true,
    }
  );
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
  await getTableRepository();
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
