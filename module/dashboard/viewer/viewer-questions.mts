/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { questionTopic } from "./viewer-data.mjs";

const titleFrom = (text) => text.match(/^[^\"]*"([^"]+)"/)?.[1];

type Answer = { author: string; text: string };
type Question = { id?: string; title: string; owner: string; text: string; answers: Answer[]; sharedWith: string[]; agents: Set<string>; isNew: boolean };
type QuestionEvent = { agent: string; kind: string; text: string; questionId?: string; participants?: string[] };
type QuestionApiEvent = QuestionEvent & {
  eventType?: string;
  httpMethod?: string;
  apiPath?: string;
  correlationId?: string;
  occurredAt?: string;
  runId?: string;
  eventData?: { recipients?: unknown[] };
};
type ReportQuestion = Omit<Question, "agents" | "isNew" | "sharedWith"> & { sharedWith?: string[] };
type ApiQuestion = {
  id: string;
  profileId: string;
  title: string | null;
  questionText: string;
  optionList: string[] | null;
  createdAt?: string;
};
type ApiAnswer = {
  id: string;
  questionId: string;
  answeredBy: string;
  answerText: string | null;
  optionAnswerList: string[] | null;
  createdAt?: string;
  isEdited?: boolean;
};

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

export function renderQuestions({ activeAgent, elements, questions, status, selectedQuestionId, answers, answerStatus, activityEvents, onSelect, renderInspector }) {
  elements.viewTitle.textContent = "Questions";
  elements.filterNote.textContent = activeAgent && status === "ready" ? `${questions.length} questions visible to ${activeAgent}` : "Select a person";
  if (!activeAgent) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "Select Mike, Bella, Ian or Eric to load their questions.";
    elements.feed.replaceChildren(empty);
    renderInspector({ title: "Question details", kindLabel: "Question", text: "Select a question to view details." });
    return;
  }
  if (status === "loading") {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = `Loading questions visible to ${activeAgent}…`;
    elements.feed.replaceChildren(empty);
    renderInspector({ title: "Question details", kindLabel: "Question", text: "Select a question to view details." });
    return;
  }
  if (status === "error") {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = `Questions for ${activeAgent} could not be loaded.`;
    elements.feed.replaceChildren(empty);
    renderInspector({ title: "Question details", kindLabel: "Question", text: "The Question API request failed." });
    return;
  }
  if (!questions.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = `No questions are visible to ${activeAgent}.`;
    elements.feed.replaceChildren(empty);
    renderInspector({ title: "Question details", kindLabel: "Question", text: "Select a question to view details." });
    return;
  }

  const node = (tag: string, className = "", text = "") => {
    const item = document.createElement(tag);
    item.className = className;
    item.textContent = text;
    return item;
  };
  const copyButton = (value: string) => {
    const button = node("button", "technical-copy", "Copy") as HTMLButtonElement;
    button.type = "button";
    button.setAttribute("aria-label", `Copy ${value}`);
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(value);
      button.textContent = "Copied";
      elements.announcer.textContent = "API path copied";
    });
    return button;
  };
  const technicalRow = (label: string, value: string, copy = false) => {
    const row = node("div", "technical-row");
    row.append(node("dt", "", label), node("dd", "", value));
    if (copy) row.append(copyButton(value));
    return row;
  };
  const disclosure = (label: string, body: HTMLElement) => {
    const details = node("details", "detail-disclosure");
    details.append(node("summary", "", label), body);
    return details;
  };
  const resolvedRecipients = (event: QuestionApiEvent) => (event.eventData?.recipients ?? []).map(String).map((recipient) => {
    const anonymous = recipient.match(/^Person\s+(\d+)$/i);
    if (!anonymous) return recipient;
    const runParticipants = participantNames((activityEvents as QuestionApiEvent[]).filter((item) => item.runId === event.runId));
    return runParticipants.filter((name) => name !== event.agent)[Number(anonymous[1]) - 1] ?? recipient;
  });
  const inspect = (question: ApiQuestion) => {
    renderInspector({
      agent: activeAgent,
      kind: "question",
      kindLabel: "Question",
      title: question.title || "Untitled question",
      questionId: question.id,
      time: question.createdAt ? new Date(question.createdAt).toLocaleString() : "Not provided",
      text: question.questionText,
    });
    const content = node("div", "question-details");
    content.append(node("p", "question-text", question.questionText));

    const shareEvents = (activityEvents as QuestionApiEvent[]).filter((event) => event.questionId === question.id && event.eventType === "question.shared");
    const sharedWith = [...new Set(shareEvents.flatMap(resolvedRecipients))];
    const sharing = node("section", "created-detail");
    sharing.append(
      node("h3", "detail-section-title", "Shared with"),
      node("p", sharedWith.length ? "answer-value" : "detail-empty", sharedWith.length ? sharedWith.join(", ") : "Not available for this run")
    );
    content.append(sharing);

    const answerSection = node("section", "answer-section");
    answerSection.append(node("h3", "detail-section-title", "Answers"));
    const answerList = node("div", "answer-list");
    const matching = (answers as ApiAnswer[]).filter((answer) => answer.questionId === question.id);
    if (answerStatus === "loading") answerList.append(node("p", "detail-empty", "Loading answers…"));
    else if (answerStatus === "error") answerList.append(node("p", "detail-empty", "Answers could not be loaded."));
    else if (answerStatus !== "ready") answerList.append(node("p", "detail-empty", "Select this question to load answers."));
    else if (!matching.length) answerList.append(node("p", "detail-empty", "No answers recorded."));
    else for (const answer of matching) {
      const card = node("article", "answer-card");
      const head = node("div", "answer-card-head");
      head.append(node("strong", "", answer.answeredBy));
      if (answer.isEdited) head.append(node("span", "edited-badge", "Edited"));
      card.append(
        head,
        node("p", "answer-value", answer.optionAnswerList?.length ? answer.optionAnswerList.join(", ") : answer.answerText || "No answer content"),
        node("p", "answer-time", answer.createdAt ? `Answered at ${new Date(answer.createdAt).toLocaleString()}` : "Answered timestamp not provided")
      );
      answerList.append(card);
    }
    answerSection.append(answerList);
    content.append(answerSection);

    const options = node("div", "detail-disclosure-body");
    if (question.optionList?.length) {
      const list = node("ul", "option-list");
      question.optionList.forEach((option) => list.append(node("li", "", option)));
      options.append(list);
    } else options.append(node("p", "detail-empty", "No options."));
    content.append(disclosure(`Options (${question.optionList?.length ?? 0})`, options));

    const created = node("section", "created-detail");
    created.append(node("h3", "detail-section-title", "Created at"), node("time", "", question.createdAt ? new Date(question.createdAt).toLocaleString() : "Not provided"));
    content.append(created);

    const technical = node("div", "detail-disclosure-body");
    const technicalList = node("dl", "technical-list");
    technicalList.append(
      technicalRow("Question Source API", "GET /questionQry/getQuestions", true),
      technicalRow("Question Dashboard Proxy", "GET /api/questions?person={person}", true),
      technicalRow("Answer Source API", "GET /questionQry/getAnswers/{questionId}", true),
      technicalRow("Answer Dashboard Proxy", "POST /api/answers", true)
    );
    const executions = (activityEvents as QuestionApiEvent[])
      .filter((event) => event.questionId === question.id && event.httpMethod && event.apiPath && event.eventType !== "api.failed")
      .sort((left, right) => Date.parse(right.occurredAt ?? "") - Date.parse(left.occurredAt ?? ""));
    if (!executions.length) technicalList.append(technicalRow("Recorded AI Execution", "Not available for this run"));
    else executions.forEach((event) => {
      const actor = event.agent || "Unknown actor";
      const occurred = event.occurredAt ? new Date(event.occurredAt).toLocaleString() : "time not recorded";
      technicalList.append(technicalRow(`AI ${event.eventType ?? "API call"}`, `${event.httpMethod} ${event.apiPath} · ${actor} · ${occurred}`, true));
      const recipients = resolvedRecipients(event).filter(Boolean);
      if (recipients.length) technicalList.append(technicalRow("Shared with", recipients.join(", ")));
      if (event.correlationId) technicalList.append(technicalRow("Correlation ID", event.correlationId, true));
    });
    technical.append(technicalList);
    content.append(disclosure("API & Technical Details", technical));
    elements.eventText.replaceChildren(content);
  };
  const timestamp = (value?: string) => value ? Date.parse(value) || 0 : 0;
  const orderedQuestions = [...questions].sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt));
  const items = orderedQuestions.map((question) => {
    const item = document.createElement("li");
    item.className = "feed-item kind-question";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "feed-button question-summary";
    button.innerHTML = `<span class="question-main"><strong></strong><small class="question-meta"></small><span class="question-card-text"></span></span>`;
    button.querySelector("strong").textContent = question.title || "Untitled question";
    button.querySelector(".question-meta").textContent = [
      question.createdAt ? new Date(question.createdAt).toLocaleString() : "Created time not provided",
      `${question.optionList?.length ?? 0} options`,
    ].join(" · ");
    button.querySelector(".question-card-text").textContent = question.questionText;
    button.classList.toggle("is-selected", question.id === selectedQuestionId);
    button.setAttribute("aria-pressed", String(question.id === selectedQuestionId));
    button.addEventListener("click", () => {
      onSelect(question.id);
    });
    item.append(button);
    return item;
  });
  elements.feed.replaceChildren(...items);
  const selected = questions.find((question) => question.id === selectedQuestionId);
  if (selected) inspect(selected);
  else renderInspector({ title: "Question details", kindLabel: "Question", text: "Select a question to view details." });
}
