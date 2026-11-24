/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */
import { api, ApiError } from "./api.ts";
import { confirmAction } from "./dialogs.ts";
import { clearFieldError, validateForm } from "./forms.ts";
import type { BuddyAvailability, BuddyCategory, BuddyConversation, BuddyMemorySnapshot, BuddyReply, BuddyTurn, DiaryFocus, SavedBuddyProposal } from "../../IdentityRepository/src/contracts.ts";

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const categories: Record<BuddyCategory, string> = { like: "Like", dislike: "Dislike", want: "Want", goal: "Goal or ambition", value: "Value", boundary: "Boundary" };
type View = "chat" | "diary" | "review" | "archive" | "history";
type Review = SavedBuddyProposal & { error?: string; stale?: boolean; acknowledged?: boolean };
type Reveal = { request_id: string; parts: string[]; shown: number; started: number; duration: number };
type Session = { afterComposition?: () => void; reveal?: Reveal; frame?: number; resize?: ResizeObserver; follow: boolean; scrollTop: number; sentAt?: string; data?: BuddyMemorySnapshot; reviews: Review[]; view: View; selected?: string; draft: string; archiveSearch: string; archiveCategory: "all" | BuddyCategory; request?: { request_id: string; message: string; conversation_id?: string }; date: string; focus: DiaryFocus; busy: boolean; loading: boolean; error: string; notice: string; availability?: BuddyAvailability };
const sessions = new Map<string, Session>();
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric" });
export function clearBuddyProfile(id: string) { sessions.delete(id); }

export function renderBuddy(container: HTMLElement, id: string, onSaved: () => Promise<void>) {
  let session = sessions.get(id);
  if (!session) {
    session = { follow: true, scrollTop: 0, reviews: [], view: "chat", draft: "", archiveSearch: "", archiveCategory: "all", date: today(), focus: "today", busy: false, loading: false, error: "", notice: "" };
    sessions.set(id, session);
  }
  const chat = session;
  container.dataset.buddyProfile = id;
  const path = `/profiles/${encodeURIComponent(id)}/buddy`;
  const visible = () => container.dataset.view === "buddy" && container.dataset.buddyProfile === id;
  const current = () => chat.data?.memory.conversations.find(c => c.conversation_id === chat.selected);
  const conversations = () => [...(chat.data?.memory.conversations ?? [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  function selectConversation(c?: BuddyConversation) {
    chat.selected = c?.conversation_id; chat.request = undefined; chat.draft = "";
    chat.reveal = undefined; chat.follow = true; chat.scrollTop = 0;
    if (c) { chat.view = c.mode; chat.date = c.diary_date || today(); chat.focus = c.diary_focus || "today"; }
  }

  async function reload(selectLatest = false) {
    const data = await api<BuddyMemorySnapshot>(`${path}/memory`);
    chat.data = data;
    const savedRequest = chat.request && data.memory.conversations.find(c => c.turns.some(t => t.request_id === chat.request!.request_id && t.status !== "processing"));
    if (savedRequest) { chat.selected = savedRequest.conversation_id; chat.request = undefined; }
    chat.reviews = data.memory.proposals.map(p => {
      const old = chat.reviews.find(old => old.proposal_id === p.proposal_id);
      return p.status === "pending" && old ? { ...p, preference: old.preference, category: old.category, acknowledged: old.acknowledged, error: old.error, stale: old.stale } : { ...p };
    });
    if (selectLatest && !chat.selected) selectConversation(conversations()[0]);
  }

  function submitDisabled() {
    return chat.busy || chat.loading || !chat.data || !!chat.request || !chat.draft.trim()
      || (chat.view !== "diary" && !chat.availability?.available);
  }

  function turnView(t: BuddyTurn, pending = false) {
    const waiting = chat.busy && chat.request?.request_id === t.request_id;
    const reveal = chat.reveal?.request_id === t.request_id ? chat.reveal : undefined;
    return `<article class="buddy-message user ${pending ? "is-new" : ""}" aria-label="Your message"><p>${escape(t.content)}</p></article>
      <article class="buddy-message assistant"><span class="buddy-avatar" aria-hidden="true">B</span><div class="buddy-response"><strong>Buddy</strong>
      ${waiting ? '<div class="buddy-thinking" role="status"><span class="buddy-typing" aria-hidden="true"><i></i><i></i><i></i></span><span>Buddy is replying…</span></div>' : t.reply ? `<p class="buddy-reply">${reveal ? `<span data-buddy-reveal="${t.request_id}" aria-hidden="true">${escape(reveal.parts.slice(0, reveal.shown).join(""))}</span><span class="sr-only">${escape(t.reply)}</span>` : escape(t.reply)}</p>${reveal ? '<button type="button" class="text-button buddy-show-reply" data-buddy="show-reply">Show full reply</button>' : ""}` : `<div class="buddy-turn-status"><p>${escape(pending ? "Delivery not confirmed. Your message is kept here for retry." : t.error || "This entry is saved. Buddy may still be responding.")}</p><button type="button" data-retry="${t.request_id}" ${chat.busy || chat.loading || (!chat.availability?.available && chat.view !== "diary") ? "disabled" : ""}>Try Buddy again</button></div>`}</div></article>`;
  }

  function conversationView() {
    const c = current(), diary = chat.view === "diary";
    const pending = chat.request && !c?.turns.some(t => t.request_id === chat.request!.request_id)
      ? { request_id: chat.request.request_id, content: chat.request.message, created_at: chat.sentAt!, status: "processing" as const } : undefined;
    const empty = !c?.turns.length && !pending;
    const locked = chat.busy || chat.loading || !chat.data;
    return `<div class="buddy-conversation ${empty ? "is-empty" : ""}">
      ${diary ? `<div class="buddy-diary-options"><label>Entry date<input name="diary-date" type="date" value="${escape(chat.date)}" ${locked || c ? "disabled" : ""} /></label><label>Writing about<select name="diary-focus" aria-label="Writing about" ${locked || c ? "disabled" : ""}><option value="today" ${chat.focus === "today" ? "selected" : ""}>What happened today</option><option value="future" ${chat.focus === "future" ? "selected" : ""}>Hopes for the future</option></select></label></div>` : ""}
      <div class="buddy-message-area"><div class="buddy-messages" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions" tabindex="0"><div class="buddy-thread">
        ${empty ? `<div class="buddy-empty"><span class="buddy-welcome-mark" aria-hidden="true">B</span><h2>${diary ? "A moment for yourself." : "What’s on your mind?"}</h2><p>${diary ? "Tell me about your day, or something you’re looking forward to." : "Talk about your day, an interest, or something you want to work toward."}</p></div>` : (c?.turns.map(t => turnView(t)).join("") || "") + (pending ? turnView(pending, true) : "")}
        ${chat.loading || !chat.availability ? `<p class="buddy-feedback" role="status">${chat.loading ? "Loading saved memory…" : "Checking connection…"}</p>` : !chat.availability.available ? `<div class="buddy-feedback" role="status"><span>${escape(chat.availability.reason || "Buddy is not connected yet.")}${diary ? " You can still save your diary." : ""}</span> <button class="text-button" type="button" data-buddy="reconnect">Check connection</button></div>` : ""}
        ${chat.error ? `<div class="buddy-error" role="alert">${escape(chat.error)} <button class="text-button" data-buddy="reload">Reload memory</button></div>` : ""}
      </div></div><button type="button" class="buddy-jump" data-buddy="latest-message" aria-label="Jump to latest message" ${chat.follow ? "hidden" : ""}>↓ Latest message</button></div>
      <div class="buddy-composer-shell">
        <form novalidate id="buddy-compose" class="buddy-compose"><label><span class="sr-only">Message Buddy</span><textarea name="message" rows="1" maxlength="${diary ? 6000 : 2000}" required placeholder="${diary ? "Write about your day or your hopes…" : "Message Buddy…"}" ${chat.loading || !chat.data ? "readonly" : ""}>${escape(chat.draft)}</textarea></label><button class="primary buddy-send ${diary ? "is-diary" : ""}" type="submit" aria-busy="${chat.busy}" ${submitDisabled() ? "disabled" : ""}>${diary ? "Save entry" : "Send"}</button></form>
      </div>
    </div>`;
  }

  function draw(focusComposer = false) {
    if (!visible()) return;
    const previous = container.querySelector<HTMLTextAreaElement>("#buddy-compose textarea");
    if (previous?.dataset.composing === "true") { chat.afterComposition = () => draw(focusComposer); return; }
    if (chat.frame) cancelAnimationFrame(chat.frame);
    chat.resize?.disconnect();
    const keepFocus = previous === document.activeElement;
    const selection = keepFocus && previous ? [previous.selectionStart, previous.selectionEnd] : undefined;
    const pending = chat.reviews.filter(p => p.status === "pending").length;
    const conversation = chat.view === "chat" || chat.view === "diary";
    container.innerHTML = `<section class="buddy-workspace" aria-label="AI Buddy chat">
      <div class="buddy-toolbar"><div class="buddy-tabs" role="group" aria-label="Buddy views">${([["chat", "Chat"], ["diary", "Diary"], ["review", "Recommendations"], ["archive", "Archive"], ["history", "History"]] as const).map(([view,label]) => `<button data-buddy-view="${view}" aria-pressed="${chat.view === view}" ${chat.busy || chat.loading ? "disabled" : ""}>${label}${view === "review" && pending ? `<span class="buddy-count">${pending}</span>` : ""}</button>`).join("")}</div>${conversation ? `<button type="button" class="buddy-new" data-buddy="new" aria-label="${chat.view === "diary" ? "New diary entry" : "New conversation"}" title="${chat.view === "diary" ? "New diary entry" : "New conversation"}" ${chat.busy || chat.loading || !chat.data ? "disabled" : ""}><span aria-hidden="true">+</span><span class="buddy-new-label">${chat.view === "diary" ? "New entry" : "New chat"}</span></button>` : ""}</div>
      ${chat.view === "history" ? historyView() : chat.view === "archive" ? archiveView() : chat.view === "review" ? reviewView() : conversationView()}
      ${!conversation && chat.notice ? `<p class="buddy-notice" role="status">${escape(chat.notice)}</p>` : ""}${!conversation && chat.error ? `<div class="buddy-error" role="alert">${escape(chat.error)} <button class="text-button" data-buddy="reload">Reload memory</button></div>` : ""}
    </section>`;
    const host = container.querySelector<HTMLElement>(".buddy-workspace")!;
    const composer = host.querySelector<HTMLTextAreaElement>('#buddy-compose textarea');
    if (composer) {
      composer.addEventListener("compositionstart", () => { composer.dataset.composing = "true"; });
      composer.addEventListener("compositionend", () => {
        delete composer.dataset.composing;
        requestAnimationFrame(() => { const drawAfter = chat.afterComposition; chat.afterComposition = undefined; drawAfter?.(); });
      });
      composer.addEventListener("keydown", event => {
        if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        const submit = composer.form?.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (!event.repeat && composer.value.trim() && submit && !submit.disabled) composer.form!.requestSubmit(submit);
      });
    }
    host.addEventListener("input", event => {
      const input = event.target as HTMLInputElement;
      clearFieldError(input);
      if (input.name === "message") {
        chat.draft = input.value;
        host.querySelector<HTMLButtonElement>('#buddy-compose [type="submit"]')!.disabled = submitDisabled();
        return;
      }
      if (input.name === "diary-date") { chat.date = input.value; return; }
      if (input.name === "diary-focus") { chat.focus = input.value as DiaryFocus; return; }
      if (input.name === "archive-search" || input.name === "archive-category") {
        if (input.name === "archive-search") chat.archiveSearch = input.value;
        else chat.archiveCategory = input.value as Session["archiveCategory"];
        const name = input.name, selection = input instanceof HTMLInputElement ? [input.selectionStart, input.selectionEnd] : undefined;
        draw();
        const next = container.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
        next?.focus({ preventScroll: true });
        if (selection && next instanceof HTMLInputElement) next.setSelectionRange(selection[0], selection[1]);
        return;
      }
      const form = input.closest<HTMLFormElement>("[data-proposal]");
      const p = chat.reviews.find(p => p.proposal_id === form?.dataset.proposal);
      if (!p) return;
      if (input.name === "keyword" || input.name === "definition") p.preference[input.name] = input.value;
      if (input.name === "category") {
        p.category = input.value as BuddyCategory;
        if (p.category === "like" || p.category === "dislike") p.preference.personas = p.preference.personas.map(a => ({ ...a, affinity: (p.category === "dislike" ? -1 : 1) * (Math.abs(a.affinity) || 0.5) }));
        draw(); container.querySelector<HTMLSelectElement>(`[data-proposal="${p.proposal_id}"] [name=category]`)?.focus();
      }
      if (input.name === "acknowledge") {
        p.acknowledged = input.checked;
        form!.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled = !p.acknowledged || !!p.stale;
      }
    });
    host.addEventListener("click", async event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (!button || (chat.busy && !["latest-message", "show-reply"].includes(button.dataset.buddy || ""))) return;
      try {
        if (button.dataset.buddyView) {
          const next = button.dataset.buddyView as View;
          if ((next === "chat" || next === "diary") && current()?.mode !== next) {
            if ((chat.draft || chat.request) && !(await confirmAction({ title: "Leave this unfinished message?", message: "Saved entries will stay. Your unsent draft will be discarded.", danger: true }))) return;
            selectConversation(conversations().find(c => c.mode === next));
          }
          chat.view = next; chat.error = ""; chat.notice = ""; draw(); return;
        }
        if (button.dataset.openConversation) { selectConversation(conversations().find(c => c.conversation_id === button.dataset.openConversation)); draw(); return; }
        if (button.dataset.buddy === "show-reply") { chat.reveal = undefined; draw(); return; }
        if (button.dataset.buddy === "latest-message") {
          chat.follow = true;
          const messages = container.querySelector(".buddy-messages")!;
          messages.scrollTop = messages.scrollHeight;
          button.hidden = true; return;
        }
        if (button.dataset.retry) {
          const t = current()?.turns.find(t => t.request_id === button.dataset.retry);
          if (t) await send(t.content, t.request_id);
          else if (chat.request?.request_id === button.dataset.retry) await send(chat.request.message, chat.request.request_id);
          return;
        }
        if (button.dataset.deleteConversation) {
          const conversation = conversations().find(c => c.conversation_id === button.dataset.deleteConversation);
          if (!(await confirmAction({ title: "Delete this conversation?", message: `“${conversation?.title || "Conversation"}” and its active recommendations will be deleted. Archived recommendations and approved preferences will stay.`, confirmLabel: "Delete conversation", cancelLabel: "Keep conversation", danger: true }))) return;
          chat.busy = true; draw();
          try {
            await api(`${path}/conversations/${encodeURIComponent(button.dataset.deleteConversation)}`, "DELETE", undefined, chat.data!.revision);
            if (chat.selected === button.dataset.deleteConversation) selectConversation();
            await reload(); chat.notice = "Saved conversation deleted. Approved preferences are unchanged."; await onSaved();
          } finally { chat.busy = false; draw(); }
          return;
        }
        if (button.dataset.buddy === "new") {
          if ((chat.draft || chat.request) && !(await confirmAction({ title: "Leave this unfinished message?", message: "Saved entries will stay. Your unsent draft will be discarded.", danger: true }))) return;
          selectConversation(); chat.error = ""; chat.notice = ""; chat.date = today(); draw(true); return;
        }
        if (button.dataset.buddy === "reload" || button.dataset.buddy === "refresh") { await reload(); chat.error = ""; draw(); return; }
        if (button.dataset.buddy === "reconnect") { await connect(); return; }
        if (button.dataset.buddy === "clear-archive-filters") { chat.archiveSearch = ""; chat.archiveCategory = "all"; draw(); container.querySelector<HTMLInputElement>('[name="archive-search"]')?.focus(); return; }
        const p = chat.reviews.find(p => p.proposal_id === button.closest<HTMLFormElement>("[data-proposal]")?.dataset.proposal);
        if (!p) return;
        if (button.dataset.buddy === "archive" || button.dataset.buddy === "latest") {
          chat.busy = true; p.error = ""; draw();
          try {
            if (button.dataset.buddy === "archive") {
              await api(`${path}/proposals/${p.proposal_id}/archive`, "POST");
              chat.notice = "Recommendation archived. Your preferences are unchanged.";
            } else {
              const updated = await api<SavedBuddyProposal>(`${path}/proposals/${p.proposal_id}/review`, "POST");
              const { keyword, definition } = p.preference;
              const category = p.category;
              Object.assign(p, updated, { category, stale: false, acknowledged: false });
              Object.assign(p.preference, { keyword, definition });
              chat.notice = "Latest profile loaded. Review the comparison and your wording before approving.";
            }
            await reload(); await onSaved();
          } catch (error) { p.error = (error as Error).message; }
          finally { chat.busy = false; draw(); }
        }
      } catch (error) { chat.error = (error as Error).message; draw(); }
    });
    host.addEventListener("submit", async event => {
      event.preventDefault();
      if (chat.busy) return;
      const form = event.target as HTMLFormElement;
      if (!validateForm(form)) return;
      if (form.id === "buddy-compose") { if (!submitDisabled()) await send(chat.draft.trim()); return; }
      const p = chat.reviews.find(p => p.proposal_id === form.dataset.proposal);
      if (!p || p.status !== "pending" || p.stale) return;
      chat.busy = true; p.error = ""; draw();
      try {
        await api(`${path}/approvals`, "POST", { proposal_id: p.proposal_id, revision: p.revision, confirmed: true, category: p.category, preference: p.preference, acknowledge_similar: p.acknowledged === true });
        p.status = "approved"; chat.notice = `Saved “${p.preference.keyword}” to your preferences.`;
        await reload(); await onSaved();
      } catch (error) { p.error = (error as Error).message; p.stale = error instanceof ApiError && error.status === 412; }
      finally { chat.busy = false; draw(); }
    });
    const messages = container.querySelector<HTMLElement>(".buddy-messages");
    if (messages) {
      messages.scrollTop = chat.follow ? messages.scrollHeight : chat.scrollTop;
      let width = messages.clientWidth, height = messages.clientHeight;
      messages.addEventListener("scroll", () => {
        // Browser scroll anchoring can fire before ResizeObserver on rotation.
        if (chat.follow && (width !== messages.clientWidth || height !== messages.clientHeight)) messages.scrollTop = messages.scrollHeight;
        width = messages.clientWidth; height = messages.clientHeight;
        chat.scrollTop = messages.scrollTop;
        chat.follow = messages.scrollHeight - messages.clientHeight - messages.scrollTop < 64;
        host.querySelector<HTMLButtonElement>(".buddy-jump")!.hidden = chat.follow;
      });
      const resize = new ResizeObserver(() => {
        if (!messages.isConnected || !visible()) { resize.disconnect(); return; }
        if (chat.follow) messages.scrollTop = messages.scrollHeight;
        width = messages.clientWidth; height = messages.clientHeight;
      });
      resize.observe(messages); resize.observe(messages.querySelector(".buddy-thread")!);
      chat.resize = resize;
    }
    if (composer && (focusComposer || keepFocus)) {
      composer.focus({ preventScroll: true });
      if (selection) composer.setSelectionRange(selection[0], selection[1]);
    }
    revealReply();
  }

  function revealReply() {
    const reveal = chat.reveal;
    const text = container.querySelector<HTMLElement>("[data-buddy-reveal]");
    if (!reveal || !text) { chat.reveal = undefined; return; }
    const finish = () => {
      text.textContent = reveal.parts.join("");
      text.removeAttribute("data-buddy-reveal");
      text.removeAttribute("aria-hidden");
      text.parentElement?.querySelector(".sr-only")?.remove();
      text.closest(".buddy-response")?.querySelector(".buddy-show-reply")?.remove();
      chat.reveal = undefined; chat.frame = undefined;
    };
    const tick = () => {
      if (!visible() || !text.isConnected || chat.reveal !== reveal) { finish(); return; }
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) { finish(); return; }
      reveal.shown = Math.min(reveal.parts.length, Math.max(1, Math.ceil((performance.now() - reveal.started) / reveal.duration * reveal.parts.length)));
      text.textContent = reveal.parts.slice(0, reveal.shown).join("");
      if (chat.follow) { const messages = container.querySelector(".buddy-messages")!; messages.scrollTop = messages.scrollHeight; }
      if (reveal.shown < reveal.parts.length) chat.frame = requestAnimationFrame(tick);
      else finish();
    };
    chat.frame = requestAnimationFrame(tick);
  }

  async function send(content: string, retryId?: string) {
    chat.busy = true; chat.error = ""; chat.notice = ""; chat.reveal = undefined; chat.follow = true;
    const c = current();
    const requestId = retryId || (chat.request?.message === content && chat.request.conversation_id === c?.conversation_id ? chat.request.request_id : crypto.randomUUID());
    chat.request = { request_id: requestId, message: content, conversation_id: c?.conversation_id };
    chat.sentAt = new Date().toISOString();
    if (!retryId) chat.draft = "";
    draw(true);
    try {
      const mode = c?.mode || (chat.view === "diary" ? "diary" : "chat");
      const result = await api<BuddyReply>(`${path}/messages`, "POST", { ...chat.request, mode, ...(mode === "diary" ? { diary_date: c?.diary_date || chat.date, diary_focus: c?.diary_focus || chat.focus } : {}) }, undefined, 130000);
      chat.selected = result.conversation_id;
      // Keep the optimistic turn until saved memory is loaded successfully.
      await reload(); chat.request = undefined;
      if (result.reply && visible() && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const parts = Array.from(result.reply);
        chat.reveal = { request_id: result.request_id, parts, shown: 0, started: performance.now(), duration: Math.min(1800, Math.max(300, parts.length * 6)) };
      }
      await onSaved();
    } catch (error) { chat.error = (error as Error).message; }
    finally { chat.busy = false; draw(); }
  }

  function historyView() {
    return `<div class="buddy-history"><div class="buddy-review-heading"><h2>Saved conversations & diary</h2><button data-buddy="refresh">Refresh</button></div>${!conversations().length ? '<p class="buddy-empty">Your saved chats and diary entries will appear here.</p>' : conversations().map(c => `<article class="buddy-history-row"><button data-open-conversation="${c.conversation_id}"><span>${c.mode === "diary" ? `${c.diary_focus === "future" ? "Future hopes" : "Diary"} · ${escape(dateLabel(c.diary_date!))}` : `Chat · ${escape(dateLabel(c.created_at.slice(0,10)))}`}</span><strong>${escape(c.title)}</strong></button><button class="danger-outline" aria-label="Delete ${escape(c.title)}" data-delete-conversation="${c.conversation_id}">Delete</button></article>`).join("")}</div>`;
  }

  function reviewView() {
    const proposals = [...chat.reviews].filter(p => p.status === "pending").reverse();
    return `<div class="buddy-review"><div class="buddy-review-heading"><h2>Recommendations</h2></div><div class="buddy-recommendation-grid">${proposals.length ? proposals.map(proposalCard).join("") : '<p class="buddy-empty">No recommendations to review.</p>'}</div></div>`;
  }

  function proposalCard(p: Review) {
    const scopes = p.preference.personas.map(a => `${a.persona || "Identity-wide"} · ${a.affinity < 0 ? "Against" : a.affinity > 0 ? "For" : "Neutral"}`).join(", ");
    const origin = chat.data?.memory.conversations.find(c => c.conversation_id === p.conversation_id);
    return `<form novalidate class="buddy-proposal" data-proposal="${p.proposal_id}"><span class="buddy-proposal-type">${p.source ? "Suggested improvement" : "Suggested addition"}${origin?.mode === "diary" ? ` · Diary ${escape(dateLabel(origin.diary_date!))}` : ""}</span>
      <blockquote>${escape(p.evidence)}</blockquote><p>${escape(p.reason)}</p>
      ${p.source ? `<div class="buddy-original"><strong>Current: ${escape(p.source.keyword)}</strong><p>${escape(p.source.definition)}</p><small>Saving creates a new version and keeps the original wording in your record.</small></div>` : ""}
      <label>Title<input name="keyword" maxlength="120" required value="${escape(p.preference.keyword)}" ${chat.busy ? "disabled" : ""} /></label>
      <label>Description<textarea name="definition" rows="3" maxlength="4000" required ${chat.busy ? "disabled" : ""}>${escape(p.preference.definition)}</textarea></label>
      <label>Category<select name="category" ${chat.busy ? "disabled" : ""}>${Object.entries(categories).map(([key,label]) => `<option value="${key}" ${p.category === key ? "selected" : ""}>${label}</option>`).join("")}</select></label><p class="buddy-scope">${escape(scopes || "Identity-wide")}</p>
      ${p.similar.length ? `<div class="buddy-similar"><strong>Similar saved preferences</strong>${p.similar.map(s => `<p>${escape(s.keyword)} — ${escape(s.definition)}</p>`).join("")}<label><input type="checkbox" name="acknowledge" ${p.acknowledged ? "checked" : ""} ${chat.busy ? "disabled" : ""} />This is a separate preference.</label></div>` : ""}
      ${p.error ? `<p class="buddy-error" role="alert">${escape(p.error)}</p>` : ""}
      <div class="buddy-proposal-actions"><button type="button" data-buddy="latest" ${chat.busy ? "disabled" : ""}>Review latest</button><button type="button" data-buddy="archive" ${chat.busy ? "disabled" : ""}>Archive</button><button type="submit" class="primary" ${chat.busy || p.stale || (p.similar.length && !p.acknowledged) ? "disabled" : ""}>Approve & save</button></div></form>`;
  }

  function archiveView() {
    if (chat.loading || !chat.data) return '<div class="buddy-archive buddy-empty" role="status" aria-busy="true"><p>Loading archived recommendations…</p></div>';
    const archived = chat.reviews.filter(p => p.status === "archived" || p.status === "dismissed")
      .sort((a, b) => (b.archived_at || b.created_at).localeCompare(a.archived_at || a.created_at));
    if (!archived.length) return '<div class="buddy-archive"><div class="buddy-empty"><h2>No archived recommendations</h2><p>Recommendations you archive will remain available here.</p></div></div>';
    const query = chat.archiveSearch.trim().toLocaleLowerCase();
    const filtered = archived.filter(p => {
      const scopes = p.preference.personas.map(a => a.persona || "Identity-wide").join(" ");
      return (chat.archiveCategory === "all" || p.category === chat.archiveCategory)
        && (!query || `${p.preference.keyword} ${p.preference.definition} ${p.evidence} ${p.reason} ${categories[p.category]} ${scopes}`.toLocaleLowerCase().includes(query));
    });
    const filteredEmpty = !filtered.length;
    return `<div class="buddy-archive-view"><div class="buddy-archive-filters"><label><span>Search archive</span><input name="archive-search" type="search" value="${escape(chat.archiveSearch)}" placeholder="Search recommendations" /></label><label><span>Category</span><select name="archive-category">${[["all", "All categories"], ...Object.entries(categories)].map(([value, label]) => `<option value="${value}" ${chat.archiveCategory === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>${chat.archiveSearch || chat.archiveCategory !== "all" ? '<button type="button" class="text-button" data-buddy="clear-archive-filters">Clear filters</button>' : ""}</div>${filteredEmpty ? '<div class="buddy-archive buddy-empty"><h2>No matching recommendations</h2><p>Try a different search or category.</p></div>' : `<div class="buddy-archive" role="region" aria-label="Archived recommendations" tabindex="0"><table class="buddy-archive-table"><caption class="sr-only">Archived preference recommendations</caption><thead><tr><th scope="col">Recommendation</th><th scope="col">Category</th><th scope="col">Context</th><th scope="col">Evidence</th><th scope="col">Archived</th></tr></thead><tbody>${filtered.map(p => {
      const scopes = p.preference.personas.map(a => a.persona || "Identity-wide").join(", ") || "Identity-wide";
      const archivedAt = p.archived_at || p.created_at;
      return `<tr><td data-label="Recommendation"><strong>${escape(p.preference.keyword)}</strong><span>${escape(p.preference.definition)}</span></td><td data-label="Category">${escape(categories[p.category])}</td><td data-label="Context">${escape(scopes)}</td><td data-label="Evidence"><span>${escape(p.evidence)}</span></td><td data-label="Archived"><time datetime="${escape(archivedAt)}">${escape(new Date(archivedAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }))}</time></td></tr>`;
    }).join("")}</tbody></table></div>`}</div>`;
  }

  async function connect() {
    try { chat.availability = await api<BuddyAvailability>("/ai-assistance"); }
    catch { chat.availability = { available: false, reason: "Buddy couldn't connect. Please try again." }; }
    draw();
  }
  async function initialize() {
    chat.loading = true; draw();
    try { await Promise.all([reload(true), connect()]); }
    catch (error) { chat.error = (error as Error).message; }
    finally { chat.loading = false; draw(); }
  }
  draw();
  if (!chat.data && !chat.loading) void initialize();
}
