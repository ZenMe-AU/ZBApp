/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { AGENTS, classifyFinding, KINDS, parseLog, parseReport, presentActivityEvents, VIEWS } from "./viewer-data.mjs";
import { elements } from "./viewer-elements.mjs";
import { renderProfileCards } from "./viewer-profiles.mjs";
import { renderQuestions } from "./viewer-questions.mjs";
import { renderNetwork, renderOverview, renderRelationships } from "./viewer-results.mjs";

declare const agGrid: { createGrid(element: HTMLElement, options: Record<string, unknown>): any };

let activityGridApi;
let questionRefreshPending = false;
let expandedActivityId = "";
const activityFilterSelections = new Map<string, Set<string>>();
const activityFilterText = new Map<string, string>();
let activityFilterSignature = "";
// Visible columns use fields shared by LanceDB events and legacy .chat.md logs.
const activityColumns: any[] = [
  {
    colId: "expand",
    width: 46,
    sortable: false,
    filter: false,
    resizable: false,
    cellRenderer: ({ data }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "activity-expand";
      button.textContent = expandedActivityId === String(data.id) ? "⌄" : "›";
      button.setAttribute("aria-label", expandedActivityId === String(data.id) ? "Collapse activity details" : "Expand activity details");
      button.addEventListener("pointerdown", (event) => event.stopPropagation());
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        state.selectedEventId = data.id;
        expandedActivityId = expandedActivityId === String(data.id) ? "" : String(data.id);
        renderActivityGrid();
      });
      return button;
    },
  },
  { field: "time", headerName: "Time", width: 110 },
  { field: "agent", headerName: "Actor", width: 120 },
  { field: "aggregateType", headerName: "Aggregate", width: 150 },
  { field: "text", headerName: "Summary", flex: 1, minWidth: 260, wrapText: true, autoHeight: true, tooltipField: "text" },
  { field: "runId", headerName: "Run ID", hide: true, minWidth: 140 },
  ...[
    "eventType", "occurredAt", "source", "actorType", "actorProfileId", "severity", "correlationId", "causationId", "aggregateId",
    "questionId", "answerId", "httpMethod", "apiPath", "httpStatus", "eventDataText", "id", "ingestedAt",
  ].map((field) => ({ field, hide: true, minWidth: 140 })),
];

const state = {
  selectedRun: "",
  latestRun: "",
  renderedSignature: "",
  announcedRun: "",
  announcedCount: 0,
  activeView: "questions",
  activeAgent: "",
  currentEvents: [],
  activityEvents: [],
  activitySignature: "",
  currentReport: parseReport(""),
  network: {},
  agentOids: {} as Record<string, string>,
  selectedEventId: null,
  chatMessages: [] as { role: "user" | "assistant"; content: string }[],
  selectedChatMessage: -1,
  chatAgent: "",
  chatStatus: "" as "" | "Thinking…" | "Answering…",
  questionPerson: "",
  questionStatus: "idle" as "idle" | "loading" | "ready" | "error",
  questions: [] as Array<{ id: string; profileId: string; title: string | null; questionText: string; optionList: string[] | null; createdAt?: string }>,
  selectedQuestionId: "",
  answerQuestionId: "",
  answerStatus: "idle" as "idle" | "loading" | "ready" | "error",
  answers: [] as Array<{ id: string; questionId: string; answeredBy: string; answerText: string | null; optionAnswerList: string[] | null; createdAt?: string; isEdited?: boolean }>,
  questionActivity: [] as any[],
};

const detailsForRun = (name) => {
  const match = name.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-[^_]+_(.+)\.chat\.md$/);
  if (!match) return { title: name.replace(".chat.md", ""), agents: "" };
  const [, date, hour, minute, names] = match;
  const [year, month, day] = date.split("-").map(Number);
  const monthName = new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(year, month - 1, day));
  return { title: `${monthName} ${day}, ${hour}:${minute}`, agents: names.replaceAll("-", ", ") };
};

function setCount(name, value) {
  const target = document.querySelector(`[data-count="${name}"]`);
  if (target) target.textContent = String(value);
}

const participantsFor = (events) => new Set<string>(events.find((event) => event.kind === "start")?.participants ?? events.map((event) => event.agent).filter(Boolean));

function visibleEvents(limit = VIEWS[state.activeView].limit ?? 120) {
  const view = VIEWS[state.activeView];
  const judgeLeaks = state.activeView === "findings" && !state.activeAgent
    ? state.currentReport.leaks.map((text, index) => ({ id: `leak-${index}`, agent: "Judge", kind: "finding", time: "Complete", text: text.slice(2) }))
    : [];
  const filtered = [...state.currentEvents, ...judgeLeaks].filter(
    (event) => (!view.kinds || view.kinds.includes(event.kind)) && (!state.activeAgent || event.agent === state.activeAgent)
  );
  const events = view.reverse ? [...filtered].reverse() : filtered;
  return events.slice(0, limit);
}

function renderActivityGrid() {
  const rows = [...state.activityEvents]
    .filter((event) => !state.activeAgent || event.agent === state.activeAgent)
    .reverse();
  elements.feed.hidden = true;
  elements.feedHead.hidden = true;
  elements.activityLayout.hidden = false;
  renderActivityFilters(rows);
  const filteredRows = filterActivityRows(rows);
  const gridRows = filteredRows.flatMap((event) => expandedActivityId === String(event.id) ? [event, { id: `${event.id}:detail`, detailEvent: event }] : [event]);
  if (!activityGridApi) {
    activityGridApi = agGrid.createGrid(elements.activityGrid, {
      columnDefs: activityColumns,
      rowData: gridRows,
      getRowId: ({ data }) => String(data.id),
      isFullWidthRow: ({ rowNode }) => Boolean(rowNode.data?.detailEvent),
      fullWidthCellRenderer: ({ data }) => activityDetailElement(data.detailEvent),
      getRowHeight: ({ data }) => data?.detailEvent ? 165 : undefined,
      defaultColDef: { filter: true, sortable: true, resizable: true },
      animateRows: false,
      enableBrowserTooltips: true,
      rowSelection: { mode: "singleRow", checkboxes: false, enableClickSelection: true },
      onRowClicked: ({ data }) => {
        if (data.detailEvent) return;
        state.selectedEventId = data.id;
        renderActivityGrid();
      },
    });
  } else {
    activityGridApi.setGridOption("rowData", gridRows);
  }
  elements.filterNote.textContent = `${filteredRows.length} of ${rows.length} events`;
  inspectActivity(filteredRows.find((event) => event.id === state.selectedEventId));
}

const activityValue = (row, field) => String(row[field] ?? "");

function filterActivityRows(rows) {
  return rows.filter((row) =>
    [...activityFilterSelections].every(([field, selected]) => selected.has(activityValue(row, field))) &&
    [...activityFilterText].every(([field, query]) => activityValue(row, field).toLowerCase().includes(query))
  );
}

function renderActivityFilters(rows) {
  const signature = `${state.activitySignature}:${state.activeAgent}`;
  if (signature === activityFilterSignature) return;
  activityFilterSignature = signature;
  activityFilterSelections.clear();
  activityFilterText.clear();
  const sections = activityColumns.filter((column) => column.field).map((column) => {
    const field = column.field;
    const values: string[] = [...new Set<string>(rows.map((row) => activityValue(row, field)))].sort((a, b) => a.localeCompare(b));
    const section = document.createElement("details");
    section.className = "activity-filter-field";
    section.dataset.filterField = `${column.headerName ?? field} ${field}`.toLowerCase();
    const summary = document.createElement("summary");
    summary.textContent = column.headerName ?? field;
    const body = document.createElement("div");
    body.className = "activity-filter-body";
    if (values.length > 20) {
      const input = document.createElement("input");
      input.type = "search";
      input.placeholder = `Filter ${column.headerName ?? field}…`;
      input.addEventListener("input", () => {
        const query = input.value.trim().toLowerCase();
        if (query) activityFilterText.set(field, query);
        else activityFilterText.delete(field);
        renderActivityGrid();
      });
      body.append(input);
    } else {
      const selected = new Set(values);
      const addOption = (labelText, value, selectAll = false) => {
        const label = document.createElement("label");
        label.className = "activity-filter-value";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = true;
        checkbox.addEventListener("change", () => {
          if (selectAll) {
            selected.clear();
            if (checkbox.checked) values.forEach((item) => selected.add(item));
            for (const child of body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) child.checked = checkbox.checked;
          } else if (checkbox.checked) selected.add(value);
          else selected.delete(value);
          if (selected.size === values.length) activityFilterSelections.delete(field);
          else activityFilterSelections.set(field, new Set(selected));
          renderActivityGrid();
        });
        label.append(checkbox, document.createTextNode(labelText || "(empty)"));
        body.append(label);
      };
      addOption("(Select All)", "", true);
      values.forEach((value) => addOption(value, value));
    }
    section.append(summary, body);
    return section;
  });
  elements.activityFilterFields.replaceChildren(...sections);
}

function activityDetailElement(event) {
  const root = document.createElement("div");
  root.className = "activity-detail";
  const groups = [
    ["Event", [["Type", event.eventType], ["Source", event.source], ["Severity", event.severity], ["Occurred", event.occurredAt ?? event.time]]],
    ["Actor & linkage", [["Actor", event.agent], ["Actor type", event.actorType], ["Profile", event.actorProfileId], ["Question", event.questionId], ["Answer", event.answerId], ["Correlation", event.correlationId]]],
    ["API", [["Method", event.httpMethod], ["Path", event.apiPath], ["Status", event.httpStatus], ["Aggregate", event.aggregateType], ["Aggregate ID", event.aggregateId]]],
  ];
  const grid = document.createElement("div");
  grid.className = "activity-detail-grid";
  for (const [title, pairs] of groups) {
    const group = document.createElement("section");
    group.className = "activity-detail-group";
    const heading = document.createElement("h3");
    heading.textContent = String(title);
    const list = document.createElement("dl");
    list.className = "activity-detail-pairs";
    for (const [label, value] of pairs as Array<[string, unknown]>) {
      if (value == null || value === "") continue;
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = String(value);
      list.append(term, description);
    }
    group.append(heading, list);
    grid.append(group);
  }
  const payload = document.createElement("section");
  payload.className = "activity-detail-group activity-detail-payload";
  const heading = document.createElement("h3");
  heading.textContent = "Event data";
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(event.eventData ?? {}, null, 2);
  payload.append(heading, pre);
  grid.append(payload);
  root.append(grid);
  return root;
}

function inspectActivity(event) {
  if (!event) return renderInspector(null);
  const shown = ["time", "agent", "kind", "text", "eventDataText"];
  const fields = activityColumns
    .map(({ field }) => field)
    .filter((field) => field && !shown.includes(field) && event[field] != null && event[field] !== "")
    .map((field) => `${field}: ${event[field]}`);
  renderInspector({
    ...event,
    text: [event.text, fields.join("\n"), event.eventData && `eventData:\n${JSON.stringify(event.eventData, null, 2)}`].filter(Boolean).join("\n\n"),
  });
}

function renderInspector(event) {
  elements.eventTitle.textContent = event?.title ?? (event ? KINDS[event.kind][0] : "No event selected");
  elements.eventActor.textContent = event?.actorLabel ?? event?.agent ?? "Q3 system";
  elements.eventTime.textContent = event?.time ?? "--:--:--";
  elements.eventKind.textContent = event?.kindLabel ?? (event?.kind === "finding" ? classifyFinding(event.text) : event ? KINDS[event.kind][1] : "System");
  elements.eventText.textContent = event?.text ?? "Choose an event from the activity view.";
  const questionId = event?.questionId ?? "";
  elements.questionIdRow.hidden = !questionId;
  elements.questionId.textContent = questionId;
  elements.questionIdCopy.dataset.questionId = questionId;
  elements.questionIdCopy.textContent = "Copy ID";
}

async function loadQuestions(person: string) {
  state.questionPerson = person;
  state.questionStatus = "loading";
  state.questions = [];
  state.selectedQuestionId = "";
  state.answerQuestionId = "";
  state.answerStatus = "idle";
  state.answers = [];
  state.questionActivity = [];
  renderFeed();
  try {
    const response = await fetch(`/api/questions?person=${encodeURIComponent(person)}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Could not load questions");
    if (state.questionPerson !== person) return;
    state.questions = body.questions;
    state.questionStatus = "ready";
  } catch {
    if (state.questionPerson !== person) return;
    state.questionStatus = "error";
  }
  renderFeed();
}

async function loadAnswers(person: string, questionId: string) {
  state.answerQuestionId = questionId;
  state.answerStatus = "loading";
  state.answers = [];
  state.questionActivity = [];
  renderFeed();
  try {
    const response = await fetch("/api/answers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person, questionId }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Could not load answers");
    if (state.questionPerson !== person || state.selectedQuestionId !== questionId) return;
    state.answers = body.answers;
    state.questionActivity = presentActivityEvents(body.activity ?? []);
    state.answerStatus = "ready";
  } catch {
    if (state.questionPerson !== person || state.selectedQuestionId !== questionId) return;
    state.answerStatus = "error";
  }
  renderFeed();
}

async function refreshQuestions() {
  if (questionRefreshPending || state.activeView !== "questions" || !state.activeAgent || state.questionPerson !== state.activeAgent) return;
  questionRefreshPending = true;
  const person = state.activeAgent;
  const questionId = state.selectedQuestionId;
  try {
    const [questionsResponse, answersResponse] = await Promise.all([
      fetch(`/api/questions?person=${encodeURIComponent(person)}`, { cache: "no-store" }),
      questionId ? fetch("/api/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person, questionId }),
      }) : undefined,
    ]);
    const questionsBody = await questionsResponse.json();
    const answersBody = answersResponse ? await answersResponse.json() : undefined;
    if (!questionsResponse.ok || (answersResponse && !answersResponse.ok)) return;
    if (state.activeView !== "questions" || state.activeAgent !== person || state.questionPerson !== person || state.selectedQuestionId !== questionId) return;
    state.questions = questionsBody.questions;
    if (answersBody) {
      state.answers = answersBody.answers;
      state.questionActivity = presentActivityEvents(answersBody.activity ?? []);
      state.answerQuestionId = questionId;
      state.answerStatus = "ready";
    }
    renderFeed();
  } finally {
    questionRefreshPending = false;
  }
}

const resultContext = () => ({ activeAgent: state.activeAgent, elements, network: state.network, report: state.currentReport, renderInspector });

function setChatTarget(agent = "") {
  if (state.chatAgent !== agent) {
    state.chatMessages = [];
    state.selectedChatMessage = -1;
  }
  state.chatAgent = agent;
  renderChat();
}

function inspectChatMessage(message: { role: "user" | "assistant"; content: string }, index: number) {
  state.selectedChatMessage = index;
  const sender = message.role === "user" ? "You" : state.chatAgent || "Test assistant";
  renderInspector({
    kind: "system",
    title: `${sender} chat message`,
    actorLabel: sender,
    kindLabel: message.role === "user" ? "Sent" : "Response received",
    time: "Not recorded",
    text: [
      `Sender\n${sender}`,
      "Timestamp\nNot provided by the chat API",
      `Response status\n${message.role === "assistant" ? "Received" : "Sent"}`,
      `Response content\n${message.content}`,
    ].join("\n\n"),
  });
  renderChat();
}

function renderChatView(participants = new Set<string>()) {
  delete document.body.dataset.activityMode;
  const names = [...new Set([...AGENTS, ...participants])];
  const filteredAgent = state.activeAgent && names.includes(state.activeAgent) ? state.activeAgent : "";
  const chatTarget = filteredAgent || (state.chatAgent && names.includes(state.chatAgent) ? state.chatAgent : names[0] ?? "");
  elements.feed.hidden = true;
  elements.feedHead.hidden = true;
  elements.chatPanel.hidden = false;
  setChatTarget(chatTarget);
  renderInspector({
    kind: "system",
    title: "Chat details",
    actorLabel: state.chatAgent || "Test assistant",
    kindLabel: "Chat",
    time: "Ready",
    text: "Select a message to inspect its sender, status and content.",
  });
  elements.viewTitle.textContent = "Chat";
  elements.filterNote.textContent = state.chatAgent || "Choose a participant";
}

function renderProfiles(participants) {
  const human = [...participants].find((name) => !AGENTS.includes(name));
  elements.humanProfile.disabled = !human;
  elements.humanProfile.dataset.profile = human ?? "";
  elements.humanProfile.querySelector("span").textContent = human ?? "Human";
  elements.humanProfile.setAttribute("aria-label", human ? `Open ${human} profile` : "Human profile is not available for this run");
  elements.humanProfile.setAttribute("aria-pressed", String(Boolean(human && state.activeAgent === human)));
  renderProfileCards({
    activeProfile: state.activeAgent,
    container: elements.profileCards,
    events: state.currentEvents,
    network: state.network,
    participants,
    agentOids: state.agentOids,
    questions: state.currentReport.questionList,
    onSelect: (name) => {
      state.activeAgent = state.activeAgent === name ? "" : name;
      state.selectedEventId = null;
      state.selectedQuestionId = "";
      renderProfiles(participants);
      renderFeed();
    },
  });
}

function renderFeed() {
  const view = VIEWS[state.activeView];
  if (state.activeView === "chat") return renderChatView(participantsFor(state.currentEvents));
  if (state.activeView === "activity") document.body.dataset.activityMode = "true";
  else delete document.body.dataset.activityMode;
  delete document.body.dataset.chatMode;
  elements.chatPanel.hidden = true;
  elements.feed.hidden = false;
  elements.activityLayout.hidden = true;
  elements.feedHead.hidden = false;
  elements.inspector.hidden = false;
  if (state.activeView === "network") return renderNetwork(resultContext());
  if (state.activeView === "overview") return renderOverview(resultContext());
  if (state.activeView === "relationships") return renderRelationships(resultContext());
  if (state.activeView === "questions") {
    if (state.activeAgent && AGENTS.includes(state.activeAgent) && state.questionPerson !== state.activeAgent) void loadQuestions(state.activeAgent);
    return renderQuestions({
      activeAgent: state.activeAgent,
      elements,
      questions: state.questionPerson === state.activeAgent ? state.questions : [],
      status: state.questionPerson === state.activeAgent ? state.questionStatus : "idle",
      selectedQuestionId: state.selectedQuestionId,
      answers: state.answerQuestionId === state.selectedQuestionId ? state.answers : [],
      answerStatus: state.answerQuestionId === state.selectedQuestionId ? state.answerStatus : "idle",
      activityEvents: state.answerQuestionId === state.selectedQuestionId ? state.questionActivity : [],
      onSelect: (questionId) => {
        state.selectedQuestionId = questionId;
        void loadAnswers(state.activeAgent, questionId);
      },
      renderInspector,
    });
  }
  if (state.activeView === "activity") return renderActivityGrid();
  if (state.activeView === "judge-chat") {
    elements.viewTitle.textContent = "Judge Chat";
    elements.filterNote.textContent = "Not connected";
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "Judge Chat will be connected in the next step.";
    elements.feed.replaceChildren(empty);
    return renderInspector(null);
  }
  const events = visibleEvents();
  elements.viewTitle.textContent = view.title;
  elements.filterNote.textContent = state.activeAgent ? `${state.activeAgent} only` : "All agents";

  if (!events.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = state.activeAgent ? `No ${view.title.toLowerCase()} events from ${state.activeAgent}.` : `No ${view.title.toLowerCase()} events yet.`;
    elements.feed.replaceChildren(empty);
    renderInspector(null);
    return;
  }

  if (!events.some((event) => event.id === state.selectedEventId)) state.selectedEventId = view.reverse ? events[0].id : events.at(-1).id;
  const items = events.map((event) => {
    const item = document.createElement("li");
    item.className = `feed-item kind-${event.kind}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "feed-button";
    button.classList.toggle("is-selected", event.id === state.selectedEventId);
    button.setAttribute("aria-pressed", String(event.id === state.selectedEventId));

    const meta = document.createElement("span");
    meta.className = "feed-meta";
    const actor = document.createElement("strong");
    actor.textContent = event.agent ?? "Q3";
    const kind = document.createElement("span");
    kind.className = "tag";
    kind.textContent = KINDS[event.kind][1];
    const time = document.createElement("time");
    time.textContent = event.time;
    meta.append(actor, kind);
    if (event.kind === "finding") {
      const category = document.createElement("span");
      category.className = "tag alert";
      category.textContent = classifyFinding(event.text);
      meta.append(category);
    }
    meta.append(time);
    const text = document.createElement("p");
    text.className = "feed-text";
    text.textContent = event.text;
    button.append(meta, text);
    button.addEventListener("click", () => {
      state.selectedEventId = event.id;
      renderFeed();
    });
    item.append(button);
    return item;
  });
  elements.feed.replaceChildren(...items);
  renderInspector(events.find((event) => event.id === state.selectedEventId));
}

function renderChat() {
  if (!elements.chatMessages) return;
  if (!state.chatMessages.length) {
    const empty = document.createElement("li");
    empty.className = "chat-empty";
    empty.textContent = "Ask about scores, answers, leaks or agent behaviour.";
    elements.chatMessages.replaceChildren(empty);
    if (state.chatStatus) {
      const status = document.createElement("li");
      status.className = "chat-message assistant chat-status-message";
      status.textContent = state.chatStatus;
      status.setAttribute("aria-live", "polite");
      elements.chatMessages.append(status);
    }
    return;
  }
  const messages = state.chatMessages.map((message, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    item.className = `chat-message-row ${message.role}`;
    button.type = "button";
    button.className = `chat-message ${message.role}`;
    button.textContent = message.content;
    button.setAttribute("aria-pressed", String(state.selectedChatMessage === index));
    button.addEventListener("click", () => inspectChatMessage(message, index));
    item.append(button);
    return item;
  });
  if (state.chatStatus) {
    const status = document.createElement("li");
    status.className = "chat-message assistant chat-status-message";
    status.textContent = state.chatStatus;
    status.setAttribute("aria-live", "polite");
    messages.push(status);
  }
  elements.chatMessages.replaceChildren(...messages);
}

function render(events, mtime) {
  state.currentEvents = events.map((event, index) => ({ ...event, id: event.id ?? index }));
  const participants = participantsFor(state.currentEvents);
  if (state.activeAgent && !AGENTS.includes(state.activeAgent) && !participants.has(state.activeAgent)) state.activeAgent = "";
  const latest = state.currentEvents.at(-1);
  const complete = state.currentEvents.some((event) => event.text.startsWith("Report saved:"));
  const grading = state.currentEvents.some((event) => event.text === "Judge is grading...");
  const reflecting = state.currentEvents.some((event) => event.text === "Everyone is done. Final memory update...");
  const fresh = Date.now() - mtime < 15_000;
  elements.runStatus.textContent = complete ? "Complete" : grading ? "Grading" : reflecting ? "Reflecting" : fresh ? "Live" : "Replay";
  elements.runStatus.dataset.state = complete ? "complete" : fresh ? "live" : "idle";
  const runDetails = detailsForRun(state.selectedRun);
  elements.runTitle.textContent = runDetails.title;
  elements.runParticipants.textContent = [...participants].join(", ");

  renderProfiles(participants);
  renderFeed();
  setCount("participants", participants.size);
  setCount("questions", state.currentEvents.filter((event) => event.kind === "question" || event.kind === "edit").length);
  setCount("answers", state.currentEvents.filter((event) => event.kind === "answer").length);
  setCount("shares", state.currentEvents.filter((event) => event.kind === "share").length);
  setCount("findings", state.currentEvents.filter((event) => event.kind === "finding").length);

  if (state.selectedRun === state.announcedRun && state.currentEvents.length > state.announcedCount && latest) {
    elements.announcer.textContent = `${latest.agent ?? "System"}: ${latest.text}`;
  }
  state.announcedRun = state.selectedRun;
  state.announcedCount = state.currentEvents.length;
}

async function loadRuns() {
  const response = await fetch("/api/runs", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not list agent runs");
  const { runs } = await response.json();
  const names = runs.map((run) => run.name);
  const newestRun = names[0] ?? "";
  if (!state.selectedRun || !names.includes(state.selectedRun) || state.selectedRun === state.latestRun) state.selectedRun = newestRun;
  state.latestRun = newestRun;
  const signature = names.join("\n");
  if (elements.runList.dataset.signature !== signature) {
    elements.runList.dataset.signature = signature;
    elements.runList.replaceChildren(
      ...runs.map((run) => {
        const details = detailsForRun(run.name);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "run-item";
        button.dataset.run = run.name;
        const title = document.createElement("strong");
        title.textContent = details.title;
        const agents = document.createElement("span");
        agents.textContent = details.agents;
        button.append(title, agents);
        return button;
      })
    );
  }
  for (const item of elements.runList.querySelectorAll<HTMLElement>("[data-run]")) {
    item.classList.toggle("is-selected", item.dataset.run === state.selectedRun);
    item.setAttribute("aria-current", item.dataset.run === state.selectedRun ? "true" : "false");
  }
}

async function loadRunState() {
  const response = await fetch("/api/run", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not read the test runner state");
  const state = await response.json();
  const active = state.status === "starting" || state.status === "running" || state.status === "waiting-for-human";
  elements.agentStartButton.disabled = active;
  elements.agentStartButton.textContent = state.status === "starting"
      ? "Starting test..."
      : state.status === "running"
        ? "Test running..."
        : state.status === "waiting-for-human"
          ? "Waiting for human..."
        : elements.agentStartButton.dataset.idleLabel;
  elements.agentStartButton.title = state.error ?? (state.status === "failed" ? `Test exited with code ${state.exitCode ?? "unknown"}` : "");
}

async function refreshLog() {
  if (!state.selectedRun) return render([], 0);
  const [response, reportResponse, networkResponse, agentsResponse] = await Promise.all([
    fetch(`/api/activity?run=${encodeURIComponent(state.selectedRun)}`, { cache: "no-store" }),
    fetch(`/api/report?run=${encodeURIComponent(state.selectedRun)}`, { cache: "no-store" }),
    fetch(`/api/network?run=${encodeURIComponent(state.selectedRun)}`, { cache: "no-store" }),
    fetch("/api/agents", { cache: "no-store" }),
  ]);
  if (!response.ok) throw new Error("Could not load the selected run");
  if (!agentsResponse.ok) throw new Error("Could not load agent OIDs");
  const { oids } = await agentsResponse.json();
  const data = await response.json();
  const report = reportResponse.ok ? await reportResponse.json() : { text: "" };
  const network = networkResponse.ok ? await networkResponse.json() : { networks: {} };
  const signature = `${data.run}:${data.mtime}:${data.events?.length ?? 0}:${data.legacyText?.length ?? 0}:${report.text.length}:${JSON.stringify(network.networks)}:${JSON.stringify(oids)}`;
  if (signature === state.renderedSignature) return;
  state.renderedSignature = signature;
  state.currentReport = parseReport(report.text);
  state.network = network.networks;
  state.agentOids = oids;
  render(data.events?.length ? presentActivityEvents(data.events) : parseLog(data.legacyText ?? ""), data.mtime);
}

async function refreshAllActivity() {
  if (state.activeView !== "activity") return;
  const response = await fetch("/api/activity?scope=all", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load activity across runs");
  const data = await response.json();
  const signature = `${data.mtime}:${data.runs.map((run) => `${run.runId}:${run.events.length}:${run.legacyText.length}`).join("|")}`;
  if (signature === state.activitySignature) return;
  state.activitySignature = signature;
  activityFilterSignature = "";
  state.activityEvents = [...data.runs].reverse().flatMap((run) => {
    if (run.events.length) return presentActivityEvents(run.events);
    return parseLog(run.legacyText).map((event, index) => ({ ...event, id: `${run.runId}:legacy:${index}`, runId: run.runId, legacy: true }));
  });
  renderActivityGrid();
}

async function update() {
  try {
    await Promise.all([loadRuns(), loadRunState()]);
    await refreshLog();
    await refreshAllActivity();
    await refreshQuestions();
  } catch (error) {
    elements.runStatus.textContent = "Unavailable";
    elements.runStatus.dataset.state = "idle";
    elements.eventTitle.textContent = "Viewer could not read the run";
    elements.eventText.textContent = error instanceof Error ? error.message : String(error);
  }
}

if (elements) {
  elements.activityFilterToggle.addEventListener("click", () => {
    const open = !elements.activityFilterToggle.getAttribute("aria-expanded").includes("true");
    elements.activityFilterToggle.setAttribute("aria-expanded", String(open));
    elements.activityFilterPanel.hidden = !open;
    elements.activityLayout.classList.toggle("is-filter-open", open);
  });
  elements.activityFilterSearch.addEventListener("input", () => {
    const query = elements.activityFilterSearch.value.trim().toLowerCase();
    for (const section of elements.activityFilterFields.children) {
      (section as HTMLElement).hidden = Boolean(query) && !(section as HTMLElement).dataset.filterField.includes(query);
    }
  });
  elements.questionIdCopy.addEventListener("click", async () => {
    const questionId = elements.questionIdCopy.dataset.questionId;
    if (!questionId) return;
    await navigator.clipboard.writeText(questionId);
    elements.questionIdCopy.textContent = "Copied";
    elements.announcer.textContent = "Question ID copied";
  });
  const startTest = async () => {
    const button = elements.agentStartButton;
    button.disabled = true;
    button.textContent = "Starting...";
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const state = await response.json();
      if (!response.ok) throw new Error(state.error ?? "Could not start the test");
      elements.announcer.textContent = "Agent test started";
      await loadRunState();
    } catch (error) {
      button.disabled = false;
      button.textContent = "Retry test";
      elements.announcer.textContent = error instanceof Error ? error.message : String(error);
    }
  };
  elements.agentStartButton.addEventListener("click", () => startTest());
  elements.runList.addEventListener("click", (event) => {
    const item = (event.target as Element).closest<HTMLElement>("[data-run]");
    if (!item) return;
    state.selectedRun = item.dataset.run;
    state.renderedSignature = "";
    state.announcedRun = "";
    state.announcedCount = 0;
    state.selectedEventId = null;
    state.chatAgent = "";
    state.chatMessages = [];
    state.chatStatus = "";
    renderChat();
    refreshLog();
    loadRuns();
  });
  elements.viewTabs.addEventListener("click", (event) => {
    const tab = (event.target as Element).closest<HTMLElement>("[data-view]");
    if (!tab) return;
    state.activeView = tab.dataset.view;
    state.selectedEventId = null;
    for (const item of elements.viewTabs.querySelectorAll("[data-view]")) item.setAttribute("aria-pressed", String(item === tab));
    renderFeed();
    if (state.activeView === "activity") void refreshAllActivity();
  });
  elements.humanProfile.addEventListener("click", () => {
    const human = elements.humanProfile.dataset.profile;
    if (!human) return;
    state.activeAgent = state.activeAgent === human ? "" : human;
    state.selectedEventId = null;
    renderProfiles(participantsFor(state.currentEvents));
    renderFeed();
  });
  elements.chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = elements.chatInput.value.trim();
    if (!message || !state.selectedRun) return;
    state.chatMessages.push({ role: "user", content: message });
    state.selectedChatMessage = -1;
    elements.chatInput.value = "";
    elements.chatSend.disabled = true;
    elements.chatSend.textContent = "Thinking…";
    state.chatStatus = "Thinking…";
    renderChat();
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run: state.selectedRun, agent: state.chatAgent, message, history: state.chatMessages }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Chat request failed");
      state.chatStatus = "Answering…";
      renderChat();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      state.chatMessages.push({ role: "assistant", content: body.answer });
    } catch (error) {
      state.chatStatus = "Answering…";
      renderChat();
      state.chatMessages.push({ role: "assistant", content: `Unable to answer: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      state.chatStatus = "";
      elements.chatSend.disabled = false;
      elements.chatSend.textContent = "Send";
      renderChat();
      elements.chatInput.focus();
    }
  });
  await update();
  // ponytail: whole-file polling is enough for short test logs; switch to byte ranges only if runs become large.
  setInterval(update, 1_000);
}
