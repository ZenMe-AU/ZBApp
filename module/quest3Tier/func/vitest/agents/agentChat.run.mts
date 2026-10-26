/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// Persona agents get to know each other only through the Q3 API.
// Skipped unless AGENT_RUN=1. Needs the func host running with AUTH_PROVIDER=authLocal
// and either a logged-in `claude` CLI or an OpenAI-compatible endpoint (LLM_BASE_URL). The LLM runs with no tools, so the
// harness is its only way out: it signs every call with the agent's own token and
// enforces the per-run limits before anything reaches the API.
// Three agents join each run and act concurrently, one small step (one API call) at a time,
// like people tapping through the app. Verified answer facts are written to memory every few steps
// and once more at the end; a judge then grades the memories against the personas.
// Run from the repo root:
//   AGENT_RUN=1 pnpm vitest run module/quest3Tier/func/vitest/agents/agentChat.test.mts --disableConsoleIntercept
// Watch the conversation live in the terminal, or in runs/<time>_<participants>.chat.md.

import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import os from "node:os";
import path from "node:path";
import { invalidAction, learningCoverage, LIMITS, needsAnswer, offlineActionReason, participantFriends, rules, STEP_SCHEMA, writeKind } from "./agentChat.config.mjs";
import { assertLlmReady, llm } from "./agentChat.llm.mjs";
import { factMemory } from "./agentChat.memory.mjs";
import { judge, report } from "./agentChat.report.mjs";
import { resetExperiment } from "./agentChat.reset.mjs";
import { HUMAN_NAME, loadAgent, LOCK_PATH, pickParticipants, RUNS_DIR, takeLock, writeMemory } from "./agentChat.setup.mjs";

const MAX_STEPS = Number(process.env.AGENT_STEPS ?? 30);
const RECENT_STEPS = 8;
const POLL_MS = 5 * 1000;
// Human participation is optional after joining; agents must finish without waiting indefinitely.
const IDLE_POLLS = 3;
const QUESTION_URL = process.env.QUESTION_URL ?? "http://127.0.0.1:7073";
async function call(agent, method, url, body?) {
  // A JSON Content-Type with an empty body makes the handler wrapper 500, so only send it with a body.
  const hasBody = body !== undefined && method !== "GET";
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${agent.token}`, ...(hasBody && { "Content-Type": "application/json" }) },
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return { status: res.status, response: JSON.parse(text) };
  } catch {
    return { status: res.status, response: text };
  }
}

export async function list(agent, p) {
  const result = await call(agent, "GET", new URL(p, QUESTION_URL));
  if (result.status >= 400) {
    const detail = typeof result.response === "string"
      ? result.response
      : result.response?.message ?? JSON.stringify(result.response);
    const errorMessage = `[ERROR] Status: ${result.status} on GET ${p} : ${detail}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
  return result.response?.return?.list ?? [];
}

const clip = (s, n = 200) => (String(s).length > n ? `${String(s).slice(0, n)}...` : String(s));

async function snapshot(agent) {
  let rawFriends = [];
  try {
    rawFriends = await list(agent, "/profile/me/friends");
  } catch (err: any) {
    console.error(`[ERROR] ${agent.name} failed to fetch friends: ${err.message}`);
  }
  const profiles = participantFriends(rawFriends, agent.shareableIds)
    .map((profile) => ({ ...profile, name: agent.labelsById?.[profile.id] ?? "unknown" }));
  const names = Object.fromEntries(profiles.map((p) => [p.id, p.name]));

  let questions = [];
  try {
    questions = await list(agent, "/questions");
  } catch (err: any) {
    console.error(`[ERROR] ${agent.name} failed to fetch questions: ${err.message}`);
  }

  for (const q of questions) {
    q.isOwner = q.profileId === agent.profileId;
    q.ownerName = agent.realNamesById?.[q.profileId];
    try {
      q.answers = await list(agent, `/question/${q.id}/answers`);
    } catch (err: any) {
      console.error(`[ERROR] ${agent.name} failed to fetch answers for [q:${q.id}]: ${err.message}`);
      q.answers = [];
    }
    for (const ans of q.answers) {
      if (!ans.profileId) continue;
      ans.author = names[ans.profileId] ?? agent.name;
      ans.memoryAuthor = agent.realNamesById?.[ans.profileId] ?? ans.author;
    }
  }
  return { questions, profiles };
}

// Empty entries would name people the agent has never met on Q3.
const knownMemory = (agent) => Object.fromEntries(Object.entries(agent.memory).filter(([, md]) => md));

// What the LLM sees of a question: only what a person reads in the app, which keeps every step's prompt small.
// The API returns only relationship-authorized answers; its profileId becomes the evidence author.
const view = (questions, names, digested = new Set()) =>
  questions.map((q) => ({
    id: q.id,
    owner: q.isOwner ? "you" : (names[q.profileId] ?? "unknown"),
    title: q.title,
    text: q.questionText,
    options: q.option ?? [],
    askers: (q.sharedByProfileIds ?? [q.profileId]).map((id) => ({ id, name: names[id] ?? "unknown" })),
    needsAnswer: needsAnswer(q),
    answers: q.answers.map((a) => ({
      id: a.id,
      ...(a.author && { by: a.author }),
      option: a.optionId ?? a.answerText,
      ...(a.isEdited && { edited: true }),
    })),
  }));

const digest = (agent, questions) => questions.forEach((q) => q.answers.forEach((a) => agent.digested.add(a.id)));

async function observe(agent) {
  const { questions: visibleQuestions, profiles } = await snapshot(agent);
  const questions = visibleQuestions;
  const names = Object.fromEntries(profiles.map((p) => [p.id, p.name]));

  // News = what appeared since this agent last looked, so it can react like a person reading notifications.
  const news = [];
  for (const q of questions) {
    if (!agent.seen.has(q.id))
      news.push(q.isOwner ? `Your question "${q.title}" is live.` : `${names[q.profileId] ?? "Someone"} shared a question with you: "${q.title}"`);
    agent.seen.add(q.id);
    for (const ans of q.answers) {
      const value = ans.optionId ?? ans.answerText;
      const key = `${ans.id}:${value}`;
      if (!agent.seen.has(key) && ans.profileId === null) news.push(`New answer on "${q.title}": ${clip(value, 120)}`);
      agent.seen.add(key);
    }
  }
  return {
    you: agent.name,
    online: agent.online,
    step: agent.steps + 1,
    budget: {
      questionWritesLeft: LIMITS.questionWrites - agent.used.questionWrites,
      answerWritesLeft: LIMITS.answerWrites - agent.used.answerWrites,
      stepsLeft: MAX_STEPS - agent.steps,
    },
    // ponytail: the first look after earlier runs lists everything; the latest 15 items are enough to react to.
    news: news.slice(-15),
    profiles,
    questions: view(questions, names, agent.digested),
    unanswered: questions.filter(needsAnswer).map((q) => ({ id: q.id, title: q.title, owner: names[q.profileId] ?? "unknown" })),
    coverage: learningCoverage(agent, questions),
    memory: Object.fromEntries(
      Object.entries(knownMemory(agent)).map(([name, value]) => [agent.labelsByName?.[name] ?? name, value])
    ),
    recent: agent.recent.slice(-RECENT_STEPS),
  };
}

const FAST = { effort: process.env.AGENT_EFFORT ?? "low", thinking: false };

async function think(agent, state, sandbox) {
  try {
    return await llm(`${rules(agent.name)}\n\n# Your persona\n${agent.persona}`, state, agent.model, STEP_SCHEMA, sandbox, FAST);
  } catch (err) {
    return { note: "", action: { method: "NONE" }, findings: [], error: err.message };
  }
}

async function reflect(agent, others, say) {
  const { questions } = await snapshot(agent);
  agent.memory = factMemory(agent.name, others, questions);
  others.forEach((name) => agent.updated.add(name));
  await writeMemory(agent.memoryDirectory, agent.name, agent.memory);
  digest(agent, questions);
  await say(`${agent.name} updated memory with verified facts: ${others.join(", ")}`);
}

async function act(agent, { method, path: p, body }, state) {
  const baseUrl = new URL(QUESTION_URL);
  const url = URL.canParse(p, baseUrl) ? new URL(p, baseUrl) : null;
  const kind = url && writeKind(method, url.pathname);
  const questions = state.questions.map((question) => ({ ...question, ownerOnline: question.owner === "you" || agent.online.includes(question.owner) }));
  const reason = url?.origin !== baseUrl.origin
    ? "origin"
    : kind && agent.used[kind] >= LIMITS[kind]
      ? `limit:${kind}`
      : offlineActionReason(url?.pathname ?? "", body, questions, agent.shareableIds) ?? invalidAction(method, url?.pathname ?? "", body);
  if (reason) return { method, path: p, body, status: "INVALID", reason, response: undefined };
  const answerMatch = url?.pathname.match(/^\/question\/([^/]+)\/answer\/?$/);
  const question = answerMatch ? state.questions.find((item) => item.id === answerMatch[1]) : undefined;
  const answerBody = answerMatch && question && body && body.recipientProfileId === undefined && question.askers?.length === 1
    ? { ...body, recipientProfileId: question.askers[0].id }
    : body;
  if (kind) agent.used[kind]++;
  return { method, path: url.pathname, body: answerBody, ...(await call(agent, method, url, answerBody)) };
}

// One human-readable line per API call for the live chat log.
function narrate(r, titles, names) {
  const [, root, id, sub] = r.path.split("/");
  const q = `"${clip(titles[id] ?? id, 80)}"`;
  if (r.status === "INVALID") return `tried ${r.method} ${r.path}, invalid (${r.reason})`;
  if (r.status >= 400) return `${r.method} ${r.path} failed (${r.status})`;
  if (r.method === "GET") return `looked at ${r.path}`;
  if (root === "question" && !id) return `asked ${r.response?.return?.id ? `[q:${r.response.return.id}] ` : ""}"${clip(r.body?.title, 80)}": ${clip(r.body?.questionText)} [${(r.body?.option ?? []).join(", ")}]`;
  if (root === "question" && sub === "share") return `shared [q:${id}] ${q} with ${(r.body?.receiverIds ?? []).map((pid) => names[pid] ?? pid).join(", ")}`;
  if (root === "question" && sub === "answer") return `answered [q:${id}] ${q}: ${clip(r.body?.option)}`;
  if (root === "question" && !sub) return `edited [q:${id}] ${q}: ${clip(JSON.stringify(r.body))}`;
  if (r.path === "/sendFollowUpCmd") {
    const filters = (r.body?.question ?? []).map((filter) => `${titles[filter.questionId] ?? filter.questionId} = ${(filter.option ?? []).join(" or ")}`).join("; ");
    return `followed up [q:${r.body?.newQuestionId ?? "unknown"}] for people matching ${filters || "the selected answers"}`;
  }
  return `${r.method} ${r.path} ${clip(JSON.stringify(r.body))}`;
}

async function runAgent(agent, agents, others, sandbox, log, say) {
  // What was on Q3 before this run is already summed up in the memory files from earlier runs.
  if (Object.keys(knownMemory(agent)).length) digest(agent, (await snapshot(agent)).questions);
  while (agent.steps < MAX_STEPS) {
    const state = await observe(agent);
    if (agent.waiting && !state.news.length) {
      // Nothing new since the agent chose to wait: check back later like a person would, without an LLM call.
      agent.idle++;
      if (agents.every((a) => a.done || a.idle >= IDLE_POLLS)) break;
      await sleep(POLL_MS);
      continue;
    }
    agent.idle = 0;
    const out = await think(agent, state, sandbox);
    const step = ++agent.steps;
    const result = out.action.method === "NONE" ? null : await act(agent, out.action, state);
    agent.waiting = !result;
    agent.findings.push(...out.findings.map((text) => ({ turn: step, text })));
    agent.recent.push({
      step,
      note: out.note,
      action: out.action,
      status: result?.status,
      reason: result?.reason,
      response: result?.response === undefined ? undefined : clip(JSON.stringify(result.response), 300),
    });
    if (out.error) log.push({ turn: step, agent: agent.name, error: out.error });
    if (result) log.push({ turn: step, agent: agent.name, ...result });

    const titles = Object.fromEntries(state.questions.map((q) => [q.id, q.title ?? q.text]));
    const names = Object.fromEntries(state.profiles.map((p) => [p.id, p.name]));
    if (out.error) await say(`${agent.name} LLM error: ${out.error}`);
    if (out.note) await say(`${agent.name}: "${clip(out.note)}"`);
    if (result) await say(`${agent.name} ${narrate(result, titles, names)}`);
    for (const text of out.findings) await say(`${agent.name} FINDING: ${text}`);
    agent.errors = out.error ? agent.errors + 1 : 0;
    if (agent.errors >= 3) {
      await say(`${agent.name} stops after 3 LLM errors in a row.`);
      break;
    }
    const learnedSomething = state.news.length > 0 || (typeof result?.status === "number" && result.status < 400);
    if (learnedSomething) await reflect(agent, others, say);
  }
  agent.done = true;
}

export async function runAgentChat() {
  // agent.md says e.g. "haiku", which only the Claude CLI understands.
  if (process.env.LLM_BASE_URL && !process.env.AGENT_MODEL) throw new Error("LLM_BASE_URL needs AGENT_MODEL (e.g. gpt-5-mini, qwen3:8b)");
  await assertLlmReady();
  await takeLock();
  try {
    const aiParticipants = await pickParticipants();
    const humanProfileId = process.env.HUMAN_PROFILE_ID;
    const humanMode = Boolean(humanProfileId);
    if (process.env.HUMAN_RUN === "1" && !humanProfileId) throw new Error("HUMAN_PROFILE_ID is required for a human test");
    const agents = await Promise.all(aiParticipants.map(loadAgent));
    const human = humanMode ? { name: HUMAN_NAME, profileId: humanProfileId } : null;
    const actors = human ? [...agents, human] : agents;
    for (const actor of agents) {
      const me = await call(actor, "GET", new URL("/profile/me", QUESTION_URL));
      if (me.status >= 400) throw new Error(`Could not register ${actor.name} (${me.status})`);
      actor.profileId = me.response.return.id;
    }
    // A real human profile can have normal Q3 data. Only Lab-owned agent data is reset.
    const removed = await resetExperiment(agents.map((agent) => agent.profileId));
    await Promise.all(actors.flatMap((actor, index) => actors.slice(index + 1).map(async (friend) => {
      const result = await call(actor, "PUT", new URL(`/profile/me/friends/${friend.profileId}`, QUESTION_URL));
      if (result.status >= 400) throw new Error(`Could not connect ${actor.name} and ${friend.name} (${result.status})`);
    })));
    if (human) {
      const contacts = await list(agents[0], "/profile/me/friends");
      const profile = contacts.find((contact) => contact.id === human.profileId);
      if (profile?.name) human.name = profile.name;
    }
    const realNamesById = Object.fromEntries(actors.map((actor) => [actor.profileId, actor.name]));
    const participants = human ? [...aiParticipants, human.name] : aiParticipants;
    const runName = `${new Date().toISOString().replaceAll(":", "-")}_${participants.join("-")}`;
    // Live chat log: printed as it happens (run vitest with --disableConsoleIntercept) and appended to a file you can keep open.
    const chatPath = path.join(RUNS_DIR, `${runName}.chat.md`);
    const say = async (line) => {
      const text = `[${new Date().toISOString().slice(11, 19)}] ${line}`;
      console.log(text);
      await appendFile(chatPath, `${text}\n\n`);
    };
    await say(`Run starts. Online: ${participants.join(", ")}.`);
    await say(`Fresh test. Cleared ${removed.records} Q3 records and ${removed.disclosures} name disclosures.`);
    await say(`Participant friend network ready: ${actors.map((actor) => actor.name).join(", ")}.`);

    const participantIds = new Set(Object.keys(realNamesById));
    for (const agent of agents) {
      let rawContacts = [];
      try {
        rawContacts = await list(agent, "/profile/me/friends");
      } catch (err: any) {
        console.error(`[ERROR] ${agent.name} failed to reach friends list: ${err.message}`);
        throw err;
      }
      const contacts = participantFriends(rawContacts, participantIds)
        .filter((contact) => contact.id !== agent.profileId);
      if (contacts.length !== actors.length - 1) throw new Error(`${agent.name} cannot reach every current participant through /profile/me/friends`);
      agent.realNamesById = realNamesById;
      agent.shareableIds = new Set(contacts.map((contact) => contact.id));
      agent.labelsById = Object.fromEntries(actors.filter((actor) => actor !== agent).map((actor, index) => [actor.profileId, `Person ${index + 1}`]));
      agent.labelsByName = Object.fromEntries(actors.map((actor) => [actor.name, actor === agent ? "you" : agent.labelsById[actor.profileId]]));
      agent.online = actors.filter((actor) => actor !== agent).map((actor) => agent.labelsById[actor.profileId]);
    }
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "q3-agent-"));
    const log = [];

    const othersOf = (agent) => participants.filter((n) => n !== agent.name);
    await Promise.all(agents.map((agent) => runAgent(agent, agents, othersOf(agent), sandbox, log, say)));
    await say("Everyone is done. Final memory update...");
    await Promise.all(agents.map((agent) => reflect(agent, othersOf(agent), say)));
    await say("Judge is grading...");

    // Every question is visible to its owner, so the union over participants covers everything they touched.
    const questions = new Map();
    const names = {};
    const readers = new Map();
    for (const agent of agents) {
      let visible = [];
      try {
        visible = await list(agent, "/questions");
      } catch (err: any) {
        console.error(`[ERROR] Failed to list questions for ${agent.name}: ${err.message}`);
        await say(`[ERROR] Failed to list questions for ${agent.name}: ${err.message}`);
      }
      const current = visible;
      if ("steps" in agent) agent.seenOthers = current.filter((question) => !question.isOwner).length;
      for (const q of current) {
        questions.set(q.id, q);
        readers.set(q.id, agent);
      }
    }
    Object.assign(names, realNamesById);
    for (const q of questions.values()) {
      const reader = readers.get(q.id) ?? agents[0];
      try {
        q.answers = await list(reader, `/question/${q.id}/answers`);
      } catch (err: any) {
        console.error(`[ERROR] Failed to list answers for [q:${q.id}] (${reader.name}): ${err.message}`);
        await say(`[ERROR] Failed to list answers for [q:${q.id}] (${reader.name}): ${err.message}`);
        q.answers = [];
      }
    }
    const judgement = await judge(agents, [...questions.values()], names, log, sandbox).catch((err) => ({ error: err.message }));

    const reportPath = path.join(RUNS_DIR, `${runName}.md`);
    await writeFile(
      reportPath,
      report(participants, agents, log, [...questions.values()], names, judgement, Object.fromEntries(actors.map((actor) => [actor.name, actor.profileId])))
    );
    await say(`Report: ${reportPath}`);

    for (const agent of agents) {
      assert.ok(agent.used.questionWrites <= LIMITS.questionWrites, `${agent.name} exceeded the question-write limit`);
      assert.ok(agent.used.answerWrites <= LIMITS.answerWrites, `${agent.name} exceeded the answer-write limit`);
      for (const other of othersOf(agent)) {
        assert.ok(agent.updated.has(other), `${agent.name} did not update memory of ${other} this run`);
      }
    }
  } finally {
    await rm(LOCK_PATH, { force: true });
  }
}
