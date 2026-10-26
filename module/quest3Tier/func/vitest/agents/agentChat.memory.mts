/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

const oneLine = (value) => String(value).replace(/\s+/g, " ").trim();

export function factMemory(owner, subjects, questions) {
  const facts = Object.fromEntries(subjects.map((name) => [name, new Set()]));
  const interactions = Object.fromEntries(subjects.map((name) => [name, []]));
  for (const question of questions) {
    for (const answer of question.answers ?? []) {
      const author = answer.memoryAuthor ?? answer.author ?? (answer.profileId ? owner : null);
      const value = answer.optionId ?? answer.answerText;
      if (!facts[author] || !question.id || !answer.id || !value) continue;
      facts[author].add(
        `- ${oneLine(question.questionText)} — ${oneLine(value)} (question: ${question.id}; answer: ${answer.id})`
      );
      if (question.ownerName === owner && author !== owner && interactions[author]) interactions[author].push(question);
      if (question.ownerName && question.ownerName !== owner && author === owner && interactions[question.ownerName]) {
        interactions[question.ownerName].push(question);
      }
    }
  }
  return Object.fromEntries(
    subjects.map((name) => {
      const lines = [`### Facts\n${[...facts[name]].join("\n") || "- None verified."}`];
      const history = interactions[name] ?? [];
      if (history.length) {
        const stage = history.length >= 4 ? "Building a connection" : history.length >= 2 ? "Learning details" : "Started";
        const last = history.at(-1);
        lines.push(
          `### Relationship\n- Stage: ${stage}\n- Interactions: ${history.length}\n- Last thread: ${oneLine(last.questionText)}\n- Next: ask a specific follow-up about a new detail; do not repeat a verified basic.`
        );
      }
      return [name, lines.join("\n\n")];
    })
  );
}
