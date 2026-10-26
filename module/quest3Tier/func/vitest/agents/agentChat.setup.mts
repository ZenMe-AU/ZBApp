/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as authDev from "../../service/authDev.mjs";
import { NAMES } from "./agentChat.config.mjs";

export const AGENTS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const RUNS_DIR = path.join(AGENTS_DIR, "runs");
export const LOCK_PATH = path.join(RUNS_DIR, ".lock");
export const HUMAN_NAME = process.env.HUMAN_NAME ?? "Human";
const MEMORY_END = "<!-- /Q3_MEMORY -->";
const PARTICIPANT_NAMES = [...NAMES, HUMAN_NAME];

const memoryStart = (name) => `<!-- Q3_MEMORY:${name} -->`;
const memoryTitle = (owner, subject) => `# ${owner}'s memory of ${subject}`;
const memorySubjects = (owner) => PARTICIPANT_NAMES.filter((name) => name !== owner);

function parseMemory(text, owner) {
  return Object.fromEntries(
    PARTICIPANT_NAMES.filter((name) => name !== owner).map((name) => {
      const start = text.indexOf(memoryStart(name));
      const end = start < 0 ? -1 : text.indexOf(MEMORY_END, start);
      const section = start < 0 || end < 0 ? "" : text.slice(start + memoryStart(name).length, end).trim();
      return [name, section.startsWith(`## ${name}`) ? section.slice(name.length + 3).trim() : section];
    })
  );
}
const readMemoryFile = async (file, subject) => {
  const text = await readFile(file, "utf8").catch(() => "");
  const separator = text.indexOf("\n\n");
  const body = text.startsWith("# ") && separator >= 0 ? text.slice(separator + 2).trim() : text.trim();
  return body.startsWith(`## ${subject}`) ? body.slice(subject.length + 3).trim() : body;
};

export async function writeMemory(directory, owner, memory) {
  await mkdir(directory, { recursive: true });
  await Promise.all(
    memorySubjects(owner).map((subject) =>
      writeFile(path.join(directory, `${subject}.md`), `${memoryTitle(owner, subject)}\n\n${memory[subject] ?? ""}\n`)
    )
  );
}
async function loadMemory(name) {
  const directory = path.join(AGENTS_DIR, name, "memory");
  const combinedFile = path.join(AGENTS_DIR, name, "memory.md");
  const combined = await readFile(combinedFile, "utf8").catch(() => "");
  const combinedMemory = combined ? parseMemory(combined, name) : {};
  const memory = Object.fromEntries(
    await Promise.all(
      memorySubjects(name).map(async (subject) => [
        subject,
        (await readMemoryFile(path.join(directory, `${subject}.md`), subject)) || combinedMemory[subject] || "",
      ])
    )
  );
  if (combined) {
    await writeMemory(directory, name, memory);
    await rm(combinedFile);
  }
  return { directory, memory };
}

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export async function takeLock() {
  await mkdir(RUNS_DIR, { recursive: true });
  try {
    await writeFile(LOCK_PATH, String(process.pid), { flag: "wx" });
  } catch {
    const pid = Number(await readFile(LOCK_PATH, "utf8").catch(() => 0));
    if (pid && isAlive(pid)) throw new Error(`Another agent run (pid ${pid}) is active; see ${LOCK_PATH}`);
    await writeFile(LOCK_PATH, String(process.pid));
  }
}

export async function pickParticipants() {
  if (process.env.AGENTS) return process.env.AGENTS.split(",").map((name) => name.trim());
  const runCount = (await readdir(RUNS_DIR).catch(() => [])).filter((file) => /_\w+(?:-\w+){2,3}\.md$/.test(file)).length;
  return [0, 1, 2].map((index) => NAMES[(runCount + index) % NAMES.length]);
}

export async function loadAgent(name) {
  const text = await readFile(path.join(AGENTS_DIR, name, `${name}.agent.md`), "utf8");
  const match = text.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
if (!match) throw new Error(`Invalid frontmatter in ${name}.agent.md`);
const [, frontmatter, persona] = match;
  const meta = Object.fromEntries(
    frontmatter.split("\n").map((line) => [line.slice(0, line.indexOf(":")).trim(), line.slice(line.indexOf(":") + 1).trim()])
  );
  const { directory: memoryDirectory, memory } = await loadMemory(name);
  return {
    name,
    persona,
    model: process.env.AGENT_MODEL ?? meta.model ?? "haiku",
    token: authDev.generateToken({
      oid: meta.oid,
      name,
      preferred_username: meta.email,
    }),
    memoryDirectory,
    memory,
    updated: new Set(),
    used: { questionWrites: 0, answerWrites: 0 },
    seen: new Set(),
    digested: new Set(),
    recent: [],
    findings: [],
    steps: 0,
    errors: 0,
    waiting: false,
    idle: 0,
    done: false,
    profileId: "",
    realNamesById: {},
    labelsById: {},
    labelsByName: {},
    shareableIds: new Set(),
    online: [],
    seenOthers: 0,
  };
}
