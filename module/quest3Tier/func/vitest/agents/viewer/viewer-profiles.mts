/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { AGENTS, KINDS } from "./viewer-data.mjs";

const DETAILS: Record<string, string> = { Mike: "Brisbane", Bella: "Brisbane", Ian: "Brisbane", Eric: "Brisbane" };

export const profileKind = (name: string) => (AGENTS.includes(name) ? "Agent" : "Human");

export function renderProfileCards({ activeProfile, container, events, network, onSelect, participants, questions: reportQuestions }) {
  const names = [...new Set([...AGENTS, ...participants])];
  const latestProfile = [...events].reverse().find((event) => event.agent)?.agent;
  const cards = names.map((name) => {
    const profileEvents = events.filter((event) => event.agent === name);
    const latest = profileEvents.at(-1);
    const isHuman = profileKind(name) === "Human";
    const questions = isHuman
      ? reportQuestions.filter((question) => question.owner === name).length
      : profileEvents.filter((event) => event.kind === "question" || event.kind === "edit").length;
    const answers = isHuman
      ? reportQuestions.flatMap((question) => question.answers).filter((answer) => answer.author === name).length
      : profileEvents.filter((event) => event.kind === "answer").length;
    const directFriends = (network[name] ?? []).filter((friend) => friend.degree === 1).length;
    const card = document.createElement("button");
    card.type = "button";
    card.className = `agent-card ${isHuman ? "slot-human" : `slot-${name.toLowerCase()}`}`;
    card.dataset.agent = name;
    card.setAttribute("aria-label", `${name}, ${profileKind(name)}`);
    card.setAttribute("aria-pressed", String(name === activeProfile));
    card.classList.toggle("is-online", participants.has(name));
    card.classList.toggle("is-active", name === latestProfile);
    card.classList.toggle("is-selected", name === activeProfile);
    card.innerHTML = '<span class="sprite" aria-hidden="true"><span class="sprite-shadow"></span><span class="sprite-leg left"></span><span class="sprite-leg right"></span><span class="sprite-body"></span><span class="sprite-head"></span><span class="sprite-hair"></span><span class="sprite-eye left"></span><span class="sprite-eye right"></span></span><span class="agent-info"><span class="agent-title"><strong></strong><span></span></span><span class="agent-state"></span><span class="agent-budget"></span></span>';
    card.querySelector("strong").textContent = name;
    card.querySelector(".agent-title span").textContent = `${DETAILS[name] ? `${DETAILS[name]} · ` : ""}${profileKind(name)}`;
    card.querySelector(".agent-state").textContent = participants.has(name) ? (latest ? KINDS[latest.kind][1] : "Ready") : "Offline";
    card.querySelector(".agent-budget").textContent = `Q ${questions}  A ${answers}  F ${directFriends}`;
    card.addEventListener("click", () => onSelect(name));
    return card;
  });
  container.replaceChildren(...cards);
}
