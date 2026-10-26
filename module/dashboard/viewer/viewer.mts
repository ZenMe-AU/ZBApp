/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { AGENTS, classifyFinding, KINDS, parseLog, parseReport, VIEWS } from "./viewer-data.mjs";
import { elements } from "./viewer-elements.mjs";
import { renderProfileCards } from "./viewer-profiles.mjs";
import { renderQuestions } from "./viewer-questions.mjs";
import { renderNetwork, renderOverview, renderRelationships } from "./viewer-results.mjs";

const state = {
  selectedRun: "",
  latestRun: "",
  renderedSignature: "",
  announcedRun: "",
  announcedCount: 0,
  activeView: "overview",
  activeAgent: "",
  currentEvents: [],
  currentReport: parseReport(""),
  network: {},
  agentOids: {} as Record<string, string>,
  selectedEventId: null,
  chatMessages: [] as { role: "user" | "assistant"; content: string }[],
  selectedChatMessage: -1,
  chatAgent: "",
  chatStatus: "" as "" | "Thinking…" | "Answering…",
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

function visibleEvents() {
  const view = VIEWS[state.activeView];
  const judgeLeaks = state.activeView === "findings" && !state.activeAgent
    ? state.currentReport.leaks.map((text, index) => ({ id: `leak-${index}`, agent: "Judge", kind: "finding", time: "Complete", text: text.slice(2) }))
    : [];
  const filtered = [...state.currentEvents, ...judgeLeaks].filter(
    (event) => (!view.kinds || view.kinds.includes(event.kind)) && (!state.activeAgent || event.agent === state.activeAgent)
  );
  const events = view.reverse ? [...filtered].reverse() : filtered;
  return events.slice(0, view.limit ?? 120);
}

function renderInspector(event) {
  elements.eventTitle.textContent = event?.title ?? (event ? KINDS[event.kind][0] : "No event selected");
  elements.eventActor.textContent = event?.actorLabel ?? event?.agent ?? "Q3 system";
  elements.eventTime.textContent = event?.time ?? "--:--:--";
  elements.eventKind.textContent = event?.kindLabel ?? (event?.kind === "finding" ? classifyFinding(event.text) : event ? KINDS[event.kind][1] : "System");
  elements.eventText.textContent = event?.text ?? "Choose an event from the activity view.";
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
      renderProfiles(participants);
      renderFeed();
    },
  });
}

function renderFeed() {
  const view = VIEWS[state.activeView];
  if (state.activeView === "chat") return renderChatView(participantsFor(state.currentEvents));
  delete document.body.dataset.chatMode;
  elements.chatPanel.hidden = true;
  elements.feed.hidden = false;
  elements.feedHead.hidden = false;
  elements.inspector.hidden = false;
  if (state.activeView === "network") return renderNetwork(resultContext());
  if (state.activeView === "overview") return renderOverview(resultContext());
  if (state.activeView === "relationships") return renderRelationships(resultContext());
  if (state.activeView === "questions")
    return renderQuestions({ activeAgent: state.activeAgent, elements, events: state.currentEvents, questions: state.currentReport.questionList, renderInspector });
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
  state.currentEvents = events.map((event, id) => ({ ...event, id }));
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
    fetch(`/api/log?run=${encodeURIComponent(state.selectedRun)}`, { cache: "no-store" }),
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
  const signature = `${data.run}:${data.mtime}:${data.text.length}:${report.text.length}:${JSON.stringify(network.networks)}:${JSON.stringify(oids)}`;
  if (signature === state.renderedSignature) return;
  state.renderedSignature = signature;
  state.currentReport = parseReport(report.text);
  state.network = network.networks;
  state.agentOids = oids;
  render(parseLog(data.text), data.mtime);
}

async function update() {
  try {
    await Promise.all([loadRuns(), loadRunState()]);
    await refreshLog();
  } catch (error) {
    elements.runStatus.textContent = "Unavailable";
    elements.runStatus.dataset.state = "idle";
    elements.eventTitle.textContent = "Viewer could not read the run";
    elements.eventText.textContent = error instanceof Error ? error.message : String(error);
  }
}

if (elements) {
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
