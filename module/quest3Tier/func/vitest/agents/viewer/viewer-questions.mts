/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { questionTopic } from "./viewer-data.mjs";

const titleFrom = (text) => text.match(/^[^\"]*"([^"]+)"/)?.[1];

type Answer = { author: string; text: string };
type Question = { id?: string; title: string; owner: string; text: string; answers: Answer[]; sharedWith: string[]; agents: Set<string>; isNew: boolean };
type QuestionEvent = { agent: string; kind: string; text: string; questionId?: string; participants?: string[] };
type ReportQuestion = Omit<Question, "agents" | "isNew" | "sharedWith"> & { sharedWith?: string[] };

const participantNames = (events: QuestionEvent[]) => events.find((event) => event.kind === "start")?.participants ?? [];

const shareRecipients = (event: QuestionEvent, participants: string[]) => {
  if (event.kind !== "share") return [];
  const recipients = event.text.match(/\swith\s+(.+)$/)?.[1] ?? "";
  const others = participants.filter((name) => name !== event.agent);
  return recipients.split(/,\s*/).map((name) => name.trim()).filter(Boolean).map((name) => {
    const anonymous = name.match(/^Person\s+(\d+)$/i);
    return anonymous ? (others[Number(anonymous[1]) - 1] ?? name) : name;
  });
};

const addUnique = (items: string[], values: string[]) => [...new Set([...items, ...values])];

export function groupQuestions(events: QuestionEvent[], reportQuestions: ReportQuestion[]) {
  const participants = participantNames(events);
  const questions = new Map<string, Question>(
    reportQuestions.map((question, index) => [
      question.id ?? `report:${index}`,
      { ...question, sharedWith: question.sharedWith ?? [], agents: new Set([question.owner, ...question.answers.map((answer) => answer.author)]), isNew: false },
    ])
  );
  const hasFinalReport = reportQuestions.length > 0;
  for (const event of events.filter((item) => ["question", "edit", "share", "answer"].includes(item.kind))) {
    const title = titleFrom(event.text);
    if (!title) continue;
    const titleMatches = [...questions.entries()].filter(([, question]) => question.title === title);
    const key = event.questionId ?? (titleMatches.length === 1 ? titleMatches[0][0] : `title:${title}`);
    if (hasFinalReport && !event.questionId && titleMatches.length !== 1) continue;
    const question = questions.get(key) ?? { id: event.questionId, title, owner: "Unknown", text: "", answers: [], sharedWith: [], agents: new Set(), isNew: false };
    question.agents.add(event.agent);
    const recipients = shareRecipients(event, participants);
    question.sharedWith = addUnique(question.sharedWith, recipients);
    recipients.forEach((recipient) => question.agents.add(recipient));
    if (event.kind === "question") {
      question.owner = event.agent;
      question.isNew = true;
      question.text ||= event.text.split(/":\s*/, 2)[1] ?? "";
    }
    if (event.kind === "answer") {
      const answer = event.text.split(/":\s*/, 2)[1] ?? "Answer recorded";
      const unknown = question.answers.find((item) => item.author === "Unknown" && item.text === answer);
      if (unknown) unknown.author = event.agent;
      else if (!question.answers.some((item) => item.author === event.agent && item.text === answer)) {
        question.answers.push({ author: event.agent, text: answer });
      }
    }
    questions.set(key, question);
  }
  return [...questions.values()];
}

export function renderQuestions({ activeAgent, elements, events, questions: reportQuestions, renderInspector }) {
  const questions = groupQuestions(events, reportQuestions).filter(
    (question) => !activeAgent || question.owner === activeAgent || question.agents.has(activeAgent)
  );
  elements.viewTitle.textContent = "Questions";
  const topics = new Set(questions.map(questionTopic));
  const overlap = Math.max(0, questions.length - topics.size);
  elements.filterNote.textContent = activeAgent
    ? `${questions.length} involving ${activeAgent}`
    : `${questions.length} questions, ${topics.size} topics, ${overlap} overlapping`;
  if (!questions.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No questions are visible in this run yet.";
    elements.feed.replaceChildren(empty);
    renderInspector(null);
    return;
  }

  const inspect = (question) =>
    renderInspector({
      agent: question.owner,
      kind: "question",
      time: question.isNew ? "This run" : "Earlier run",
      text: [
        question.text,
        question.sharedWith.length ? `Shared with: ${question.sharedWith.join(", ")}` : "Not shared with anyone in this run",
        ...question.answers.map((answer) => `${answer.author} — ${answer.text}`),
      ].filter(Boolean).join("\n\n"),
    });
  const items = questions.map((question, index) => {
    const item = document.createElement("li");
    item.className = "feed-item kind-question";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "feed-button question-summary";
    button.innerHTML = `<span class="question-main"><strong></strong><small class="question-meta"></small><small class="question-status"></small><span class="question-people"></span></span><span class="question-count"></span>`;
    button.querySelector("strong").textContent = question.title;
    button.querySelector(".question-meta").textContent = `${questionTopic(question)} | ${question.isNew ? "New this run" : "Reused"} | ${question.owner}`;
    const answerByAuthor = new Map(question.answers.map((answer) => [answer.author, answer]));
    const people = [...new Set([question.owner, ...question.sharedWith])];
    const answered = people.filter((person) => answerByAuthor.has(person)).length;
    const waitingOn = question.sharedWith.filter((person) => !answerByAuthor.has(person));
    const status = button.querySelector(".question-status");
    status.textContent = waitingOn.length
      ? `Waiting on: ${waitingOn.join(", ")}`
      : question.sharedWith.length
        ? "All shared recipients answered"
        : "Not shared in this run";
    status.classList.add(waitingOn.length ? "question-pending" : question.sharedWith.length ? "question-complete" : "question-not-shared");
    const peopleList = button.querySelector(".question-people");
    for (const person of people) {
      const row = document.createElement("span");
      row.className = "question-person";
      const name = document.createElement("span");
      name.textContent = person;
      const answer = document.createElement("span");
      const response = answerByAuthor.get(person);
      answer.textContent = response ? `✓ ${response.text}` : "— Not answered";
      answer.className = response ? "question-answered" : "question-unanswered";
      row.append(name, answer);
      peopleList.append(row);
    }
    button.querySelector(".question-count").textContent = `${answered} / ${people.length} answered`;
    button.addEventListener("click", () => {
      for (const selected of elements.feed.querySelectorAll(".is-selected")) selected.classList.remove("is-selected");
      button.classList.add("is-selected");
      inspect(question);
    });
    if (index === 0) button.classList.add("is-selected");
    item.append(button);
    return item;
  });
  elements.feed.replaceChildren(...items);
  inspect(questions[0]);
}
