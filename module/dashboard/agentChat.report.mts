/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { writeKind } from "./agentChat.config.mjs";

export function report(participants, agents, log, questions, names, judgement, profileIds = {}) {
  const cell = (value) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
  const short = (value) => (value === undefined ? "" : cell(JSON.stringify(value).slice(0, 200)));
  const ok = (event) => typeof event.status === "number" && event.status < 300;
  const questionId = (event) => event.path.split("/")[2];
  const ownerOf = Object.fromEntries(questions.map((question) => [question.id, names[question.profileId]]));
  const memoryOf = (observer, subject) => agents.find((agent) => agent.name === observer)?.memory[subject] ?? "";
  const metrics = (agent) => {
    const mine = log.filter((event) => event.agent === agent.name && !event.error);
    const shares = mine.filter((event) => ok(event) && event.method === "POST" && /^\/question\/[^/]+\/share\/?$/.test(event.path));
    const reshares = shares.filter(
      (event, index) => ownerOf[questionId(event)] !== agent.name || shares.slice(0, index).some((share) => questionId(share) === questionId(event))
    );
    const answered = new Set(
      mine.filter((event) => ok(event) && writeKind(event.method, event.path) === "answerWrites" && ownerOf[questionId(event)] !== agent.name).map(questionId)
    );
    const answerSubmissions = mine.filter((event) => ok(event) && writeKind(event.method, event.path) === "answerWrites").length;
    return [
      agent.steps,
      mine.filter((event) => ok(event) && event.method === "POST" && /^\/question\/?$/.test(event.path)).length,
      mine.filter((event) => ok(event) && ["PUT", "PATCH"].includes(event.method)).length,
      shares.length,
      reshares.length,
      `${answered.size}/${agent.seenOthers}`,
      answerSubmissions,
      Math.max(0, answerSubmissions - answered.size),
      mine.filter((event) => event.status === "INVALID").length,
      mine.filter((event) => event.status >= 400).length,
      log.filter((event) => event.agent === agent.name && event.error).length,
    ];
  };
  return [
    `# Agent chat run ${new Date().toISOString()}`,
    `Participants: ${participants.join(", ")}. Model: ${agents.map((agent) => `${agent.name}=${agent.model}`).join(", ")}.`,
    "## Participant profiles",
    [
      "| Participant | Profile ID |",
      "|---|---|",
      ...participants.map((name) => `| ${name} | ${profileIds[name] ?? ""} |`),
    ].join("\n"),
    "## Metrics",
    [
      "| Agent | Steps | New questions | Edits | Shares | Re-shares | Unique answered / visible | Answer submissions | Answer changes | Invalid | API errors | LLM errors |",
      "|---|---|---|---|---|---|---|---|---|---|---|---|",
      ...agents.map((agent) => `| ${agent.name} | ${metrics(agent).join(" | ")} |`),
    ].join("\n"),
    "## Judge",
    judgement.error
      ? `Judge error: ${judgement.error}`
      : [
          "| Observer | Subject | Accuracy /10 | Hidden links found | Correct facts | Incorrect facts | Missing facts | Stored memory | Note |",
          "|---|---|---|---|---|---|---|---|---|",
          ...judgement.pairs.map(
            (pair) =>
              `| ${pair.observer} | ${pair.subject} | ${pair.accuracy} | ${cell(pair.linksFound.join("; ") || "-")} | ${cell(JSON.stringify(pair.correctFacts))} | ${cell(JSON.stringify(pair.incorrectFacts))} | ${cell(JSON.stringify(pair.missingFacts))} | ${cell(JSON.stringify(memoryOf(pair.observer, pair.subject)))} | ${cell(pair.note)} |`
          ),
        ].join("\n"),
    "### Leaks",
    ...(judgement.leaks?.length
      ? judgement.leaks.map((leak) => `- ${leak.owner} (${leak.tier}): ${leak.item}. Evidence: "${leak.evidence}". Visible to: ${leak.visibleTo}`)
      : ["- none"]),
    "## Q3 relationship model",
    "- Recipient-scoped answers: not measurable in the current API. Answers are keyed by question and respondent, not by asker/share relationship, so one respondent cannot keep different answers for different askers.",
    "## Findings",
    ...agents.flatMap((agent) => [
      `### ${agent.name}`,
      ...(agent.findings.length ? agent.findings.map((finding) => `- (step ${finding.turn}) ${finding.text}`) : ["- none"]),
    ]),
    "## Questions (final)",
    ...questions.flatMap((question) => [
      `### ${question.title ?? "(no title)"} (id ${question.id}; owner ${names[question.profileId] ?? question.profileId})`,
      question.questionText,
      `Options: ${(question.optionList ?? []).join(" · ")}`,
      ...question.answers.map(
        (answer) => `- ${answer.isEdited ? "(edited) " : ""}${names[answer.profileId] ?? answer.profileId}: ${answer.optionAnswerList?.join(", ") ?? answer.answerText}`
      ),
    ]),
    "## Call log",
    [
      "| Step | Agent | Call | Result |",
      "|---|---|---|---|",
      ...log.map(
        (event) =>
          `| ${event.turn} | ${event.agent} | ${event.error ? "LLM" : `${event.method} ${event.path} ${short(event.body)}`} | ${
            event.error ?? `${event.status} ${event.reason ?? ""}`
          } |`
      ),
    ].join("\n"),
  ].join("\n\n");
}
