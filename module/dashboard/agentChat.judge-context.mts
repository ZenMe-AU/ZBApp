/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NAMES } from "./agentChat.config.mjs";

const TEXT_EXTENSIONS = new Set([".cjs", ".css", ".html", ".js", ".json", ".md", ".mjs", ".mts", ".sql", ".ts", ".tsx", ".yaml", ".yml"]);
const SKIP_DIRECTORIES = new Set([".git", "activity.lancedb", "coverage", "dist", "node_modules", "runs"]);
const SKIP_FILES = /^(?:\.env(?:\..*)?|local\.settings\.json)$/i;
const SECRET_KEY = /password|secret|token|authori[sz]ation|api[-_]?key|cookie|credential/i;
const SECRET_VALUE = /\b(?:Bearer\s+\S+|eyJ[\w-]+\.[\w-]+\.[\w-]+|sk-[\w-]{12,})/g;
const ALL_HISTORY = /\b(?:all|every|history|historical|past)\b|전체|모든|과거|이력/i;
const API_PATHS = [
  /^\/profile\/me(?:\/friends)?$/,
  /^\/(?:questions|sharedQuestions)$/,
  /^\/question\/[A-Za-z0-9-]+(?:\/answers|\/answer\/[A-Za-z0-9-]+)?$/,
  /^\/questionQry\/(?:getQuestions|getSharedQuestions)$/,
  /^\/questionQry\/(?:getQuestion|getAnswers|getAnswer)\/[A-Za-z0-9-]+$/,
];

type ActivityReader = {
  listByRun(runId: string): Promise<unknown[]>;
  listRuns(): Promise<Array<{ name: string }>>;
};

type ApiRequest = { actor: string; path: string };
type JudgeContextOptions = {
  dashboardDir: string;
  repositoryDir: string;
  activity: ActivityReader;
  readApi?: (actor: string, path: string) => Promise<unknown>;
};

const redact = (value: unknown, key = ""): unknown =>
  SECRET_KEY.test(key)
    ? "[redacted]"
    : typeof value === "string"
      ? value.replace(SECRET_VALUE, "[redacted]")
      : Array.isArray(value)
        ? value.map((item) => redact(item))
        : value && typeof value === "object"
          ? Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redact(item, name)]))
          : value;

const redactLine = (line: string) => {
  const separator = line.search(/[:=]/);
  if (separator >= 0 && SECRET_KEY.test(line.slice(0, separator))) return `${line.slice(0, separator + 1)} [redacted]`;
  return line.replace(SECRET_VALUE, "[redacted]");
};

const searchTerms = (question: string) =>
  [...new Set(question.toLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) ?? [])].filter((term) => !["about", "from", "that", "this", "what", "when", "where", "which", "with", "전체", "모든", "과거", "이력"].includes(term));

export function isAllowedJudgeApiPath(value: string) {
  if (!value.startsWith("/") || value.includes("?") || value.includes("#") || value.includes("..")) return false;
  return API_PATHS.some((pattern) => pattern.test(value));
}

async function readMemories(dashboardDir: string) {
  const memories: Array<{ owner: string; subject: string; path: string; content: string }> = [];
  for (const owner of NAMES) {
    const directory = path.join(dashboardDir, owner, "memory");
    const files = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const file of files) {
      if (!file.isFile() || path.extname(file.name) !== ".md") continue;
      const filename = path.join(directory, file.name);
      memories.push({
        owner,
        subject: path.basename(file.name, ".md"),
        path: path.relative(dashboardDir, filename),
        content: await readFile(filename, "utf8"),
      });
    }
  }
  return memories;
}

async function searchRepository(repositoryDir: string, question: string) {
  const terms = searchTerms(question);
  if (!terms.length) return [];
  const matches: Array<{ path: string; line: number; text: string }> = [];

  async function visit(directory: string) {
    if (matches.length >= 30) return;
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (matches.length >= 30) return;
      if (entry.isSymbolicLink()) continue;
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) await visit(filename);
        continue;
      }
      if (!entry.isFile() || SKIP_FILES.test(entry.name) || !TEXT_EXTENSIONS.has(path.extname(entry.name))) continue;
      if ((await stat(filename)).size > 512_000) continue;
      const lines = (await readFile(filename, "utf8")).split("\n");
      for (let index = 0; index < lines.length && matches.length < 30; index += 1) {
        const lower = lines[index].toLowerCase();
        if (terms.some((term) => lower.includes(term))) {
          matches.push({ path: path.relative(repositoryDir, filename), line: index + 1, text: redactLine(lines[index]).slice(0, 500) });
        }
      }
    }
  }

  await visit(repositoryDir);
  return matches;
}

export function createJudgeContextBuilder({ dashboardDir, repositoryDir, activity, readApi }: JudgeContextOptions) {
  return async function buildJudgeContext({ runId, question, apiRequests = [] }: { runId: string; question: string; apiRequests?: ApiRequest[] }) {
    const selectedEvents = await activity.listByRun(runId);
    const activityRuns = [{ runId, events: redact(selectedEvents) }];
    if (ALL_HISTORY.test(question)) {
      for (const run of await activity.listRuns()) {
        if (run.name !== runId) activityRuns.push({ runId: run.name, events: redact(await activity.listByRun(run.name)) });
      }
    }

    if (apiRequests.length > 20) throw new Error("Judge API request limit exceeded");
    const api = [];
    for (const request of apiRequests) {
      if (!NAMES.includes(request.actor)) throw new Error(`Unknown API actor: ${request.actor}`);
      if (!isAllowedJudgeApiPath(request.path)) throw new Error(`Judge API path is not allowed: ${request.path}`);
      if (!readApi) throw new Error("Judge API reader is not configured");
      api.push({ ...request, data: redact(await readApi(request.actor, request.path)) });
    }

    return {
      scope: ALL_HISTORY.test(question) ? "all-runs" : "selected-run",
      selectedRunId: runId,
      activity: activityRuns,
      memories: await readMemories(dashboardDir),
      repository: await searchRepository(repositoryDir, question),
      api,
    };
  };
}
