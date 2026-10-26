/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { questionTopic } from "./viewer-data.mjs";

const element = (tag, className, text?) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const emptyResults = (elements, renderInspector) => {
  elements.feed.replaceChildren(element("li", "empty", "Evaluation results appear when the judge finishes."));
  renderInspector(null);
};

export function renderOverview({ activeAgent, elements, report, renderInspector }) {
  elements.viewTitle.textContent = "Run overview";
  elements.filterNote.textContent = activeAgent ? `${activeAgent} selected` : "Judge summary";
  if (!report.pairs.length) {
    return emptyResults(elements, renderInspector);
  }

  const topicCount = new Set(report.questionList.map(questionTopic)).size;
  const overlap = Math.max(0, report.questionList.length - topicCount);
  const summary = element("li", "result-grid");
  const values = [
    ["Memory accuracy", `${report.average.toFixed(1)} / 10`],
    ["Unique topics", String(topicCount)],
    ["Answer coverage", `${report.answered} / ${report.seen}`],
    ["Privacy leaks", String(report.leaks.length)],
  ];
  summary.append(
    ...values.map(([label, value]) => {
      const card = element("div", "result-card");
      card.append(element("span", "", label), element("strong", "", value));
      return card;
    })
  );
  const insight = element("li", "run-insight");
  insight.append(
    element("strong", "", report.average < 5 ? "High participation, shallow understanding" : "Understanding is forming"),
    element(
      "p",
      "",
      `${report.answered} of ${report.seen} visible questions were answered, but memory accuracy is ${report.average.toFixed(1)}/10. ${overlap} question${overlap === 1 ? "" : "s"} overlapped an existing topic.`
    )
  );
  const health = element("li", "score-row");
  health.append(
    element("div", "score-top", "Run health"),
    element("p", "", `${report.answerSubmissions} answer submissions covered ${report.answered} unique agent-question pairs; ${report.answerChanges} were changes. ${report.invalid} invalid requests, ${report.apiErrors} API errors, ${report.llmErrors} LLM errors. ${report.reshares} questions were reused or re-shared.`)
  );
  const gap = element(
    "li",
    "model-gap",
    "Recipient-specific answers are not supported by the current API: answers are stored by question and respondent, not by asker relationship."
  );
  elements.feed.replaceChildren(summary, insight, health, gap);
  renderInspector({
    kind: "system",
    agent: "Judge",
    time: "Complete",
    text: `Average memory accuracy: ${report.average.toFixed(1)}/10\nAnswer coverage: ${report.answered}/${report.seen}\nPrivacy leaks: ${report.leaks.length}`,
  });
}

export function renderRelationships({ activeAgent, elements, report, renderInspector }) {
  elements.viewTitle.textContent = "Who learned what";
  elements.filterNote.textContent = activeAgent ? `${activeAgent} relationships` : "Select a pair to inspect";
  if (!report.pairs.length) return emptyResults(elements, renderInspector);

  const pairs = activeAgent ? report.pairs.filter((pair) => pair.observer === activeAgent || pair.subject === activeAgent) : report.pairs;
  const ranked = [...pairs].sort((left, right) => right.accuracy - left.accuracy);
  const summary = activeAgent && ranked.length
    ? element("li", "relationship-summary", `Closest understanding: ${ranked[0].observer} ↔ ${ranked[0].subject} (${ranked[0].accuracy}/10)\nFarthest understanding: ${ranked.at(-1).observer} ↔ ${ranked.at(-1).subject} (${ranked.at(-1).accuracy}/10)`)
    : null;
  const choices = pairs.map((pair, index) => {
    const button = element("button", "relationship-choice");
    button.append(
      element("span", "relationship-names", `${pair.observer} learned about ${pair.subject}`),
      element("span", "relationship-result", `${pair.accuracy}/10${pair.detailsAvailable && pair.incorrectFacts.length ? ` | ${pair.incorrectFacts.length} wrong` : ""}`)
    );
    button.type = "button";
    button.classList.toggle("is-selected", index === 0);
    button.addEventListener("click", () => {
      for (const selected of elements.feed.querySelectorAll(".is-selected")) selected.classList.remove("is-selected");
      button.classList.add("is-selected");
      inspectPair(pair, renderInspector);
    });
    return button;
  });
  const help = element("li", "relationship-help", "The first person learned facts about the second person. Select one pair to see the judge's assessment.");
  const grid = element("li", "relationship-grid");
  grid.append(...choices);
  elements.feed.replaceChildren(...(summary ? [summary] : []), help, grid);
  inspectPair(pairs[0], renderInspector);
}

type NetworkFriend = { degree: number; id: string; name: string; path: string[] };

export function renderNetwork({ elements, network, report, renderInspector }) {
  const people = Object.keys(network);
  elements.viewTitle.textContent = "People & friends";
  elements.filterNote.textContent = people.length ? "Current names from the Profile repository" : "No participant profiles recorded";
  if (!people.length) return emptyResults(elements, renderInspector);

  const namesById = new Map(Object.entries(report.profileIds).map(([name, id]) => [id, name]));
  for (const friends of Object.values(network) as NetworkFriend[][]) {
    for (const friend of friends) namesById.set(friend.id, friend.name);
  }
  const rows = people.flatMap((person) => {
    const friends = (network[person] ?? []) as NetworkFriend[];
    const sections = [["Direct friends", friends.filter((friend) => friend.degree === 1)], ["Through friends", friends.filter((friend) => friend.degree > 1)]] as const;
    const personRows = [element("li", "network-person", person)];
    for (const [title, group] of sections) {
      if (!group.length) continue;
      personRows.push(element("li", "network-heading", title));
      personRows.push(...group.map((friend) => {
        const path = friend.path.map((id) => namesById.get(id) ?? "Unknown").join(" → ");
        const row = element("li", "network-row");
        row.append(element("strong", "", friend.name), element("span", "", `${friend.degree} hop${friend.degree === 1 ? "" : "s"} · ${path}`));
        return row;
      }));
    }
    if (!friends.length) personRows.push(element("li", "network-empty", "No recorded friends within four degrees."));
    return personRows;
  });
  elements.feed.replaceChildren(...rows);
  renderInspector({
    kind: "system",
    agent: "Repository",
    time: "Current",
    title: "People & friends",
    kindLabel: "Friend rows",
    text: "Each group is read from the participant's friend rows. Names come from the current Profile record, not the saved friend-name snapshot.",
  });
}

function inspectPair(pair, renderInspector) {
  const facts = (items) => items.length ? items.map((item) => `- ${item}`).join("\n") : "- None recorded";
  const factCheck = pair.detailsAvailable
    ? [`Correct facts\n${facts(pair.correctFacts)}`, `Incorrect or unsupported\n${facts(pair.incorrectFacts)}`, `Important facts still missing\n${facts(pair.missingFacts)}`]
    : ["Fact-by-fact check\nNot available for this older run. Use the judge assessment above."];
  renderInspector({
    kind: "memory",
    title: `${pair.observer} learned about ${pair.subject}`,
    actorLabel: `Learner: ${pair.observer}`,
    kindLabel: `About: ${pair.subject}`,
    time: `Score ${pair.accuracy}/10`,
    text: [
      `Judge assessment\n${pair.note}`,
      ...factCheck,
      `Connection found\n${pair.links === "-" ? "None" : pair.links}`,
      `Stored memory\n${pair.memory || "Not available for this older run."}`,
    ].join("\n\n"),
  });
}
