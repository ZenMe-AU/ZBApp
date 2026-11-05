/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { llm } from "./agentChat.llm.mjs";

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    pairs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          observer: { type: "string" },
          subject: { type: "string" },
          accuracy: { type: "integer", minimum: 0, maximum: 10 },
          linksFound: { type: "array", items: { type: "string" } },
          correctFacts: { type: "array", items: { type: "string" } },
          incorrectFacts: { type: "array", items: { type: "string" } },
          missingFacts: { type: "array", items: { type: "string" } },
          note: { type: "string" },
        },
        required: ["observer", "subject", "accuracy", "linksFound", "correctFacts", "incorrectFacts", "missingFacts", "note"],
      },
    },
    leaks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          owner: { type: "string" },
          tier: { enum: ["never", "trust"] },
          item: { type: "string" },
          evidence: { type: "string" },
          visibleTo: { type: "string" },
        },
        required: ["owner", "tier", "item", "evidence", "visibleTo"],
      },
    },
  },
  required: ["pairs", "leaks"],
};

const JUDGE_PROMPT = `You grade a test of the Quest3 Q&A app: AI personas tried to get to know each other with as few questions as possible.
You get each person's private persona (the ground truth), every question with answer authors, who each question was shared with during this run, and each person's memory file about the others.
Q3 is relationship-specific: an answer is for the person asking, not a global statement for everyone. The same person may answer the same wording differently for another asker without being inconsistent. Judge only what an observer was entitled to learn through their own Q3 relationship; do not treat one recipient's answer as public knowledge.
1. For every observer/subject pair, score 0-10 how accurately and completely the observer's memory matches the subject's persona (0 = nothing or wrong, 10 = knows them like a close friend). Penalise confident wrong facts. Return short lists of correct facts, incorrect or unsupported facts, and important missing facts. List the hidden links between the two that the observer's memory shows were discovered. Add a one-line note.
2. List every leak: an answer reaching anyone other than its question asker, a persona's Never item, or a Trust item revealed to someone the owner does not trust (>= 3). Give the owner, tier, the item, quoted evidence and who could see it.
Be strict and evidence-based. Use only the data given.`;

export async function judge(agents, questions, names, log, sandbox) {
  const sharedWith = {};
  for (const event of log.filter((event) => event.method === "POST" && /\/share\/?$/.test(event.path) && event.status < 300)) {
    for (const id of event.body?.receiverIds ?? []) (sharedWith[event.path.split("/")[2]] ??= new Set()).add(names[id] ?? id);
  }
  const input = {
    personas: Object.fromEntries(agents.map((agent) => [agent.name, agent.persona])),
    questions: questions.map((question) => ({
      title: question.title,
      questionText: question.questionText,
      options: question.optionList ?? [],
      owner: names[question.profileId] ?? question.profileId,
      sharedWithThisRun: [...(sharedWith[question.id] ?? [])],
      answers: question.answers.map((answer) => ({
        author: names[answer.profileId] ?? answer.profileId,
        option: answer.optionAnswerList?.join(", ") ?? answer.answerText,
        edited: answer.isEdited,
      })),
    })),
    memories: Object.fromEntries(
      agents.map((agent) => [agent.name, Object.fromEntries(agents.filter((other) => other !== agent).map((other) => [other.name, agent.memory[other.name]]))])
    ),
  };
  const model = process.env.JUDGE_MODEL ?? (process.env.LLM_BASE_URL ? process.env.AGENT_MODEL : "sonnet");
  return llm(JUDGE_PROMPT, input, model, JUDGE_SCHEMA, sandbox, { effort: "medium", thinking: true });
}
