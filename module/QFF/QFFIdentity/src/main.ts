/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import "./style.css";
import { api, ApiError } from "./api.ts";
import { clearBuddyProfile, renderBuddy } from "./buddy.ts";
import { confirmAction, keepDialogFocus } from "./dialogs.ts";
import { clearFieldError, showFieldErrors, validateForm } from "./forms.ts";
import { preferenceErrors } from "../../IdentityRepository/src/preference-validation.ts";
import { newPreferenceDuplicate } from "../../IdentityRepository/src/buddy-preferences.ts";
import type { Affinity, PersonalDetail, Preference, PreferenceInput, ProfileSnapshot } from "../../IdentityRepository/src/contracts.ts";

const root = document.querySelector<HTMLDivElement>("#app")!;
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const labels = { interest: "Interest", want: "Wants & goals", value: "Value", boundary: "Boundary" };
const unassignedContext = "__qff_unassigned__";
const filterOptions = [["all", "All"], ["likes", "Likes"], ["dislikes", "Dislikes"], ["want", "Wants & goals"], ["value", "Values"], ["boundary", "Boundaries"]];
const storageKey = "qff.identity.selectedProfile";
const iconPaths = {
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  preferences: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  contexts: '<path d="m12 3 10 5-10 5L2 8 12 3Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
  buddy: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9H13a8.5 8.5 0 0 1 8 8v.5Z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  edit: '<path d="m16 3 5 5L8 21H3v-5L16 3Zm-2 2 5 5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>',
  left: '<path d="m14 6-6 6 6 6"/>',
  right: '<path d="m10 6 6 6-6 6"/>',
};
const icon = (name: keyof typeof iconPaths) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${iconPaths[name]}</svg>`;
const state = {
  id: "", snapshot: null as ProfileSnapshot | null,
  view: "preferences", filter: "all", search: "", context: "all", dirty: false, saving: false,
  editing: null as (PreferenceInput & { preference_id?: string }) | null,
  removing: "", highlighted: "", request: 0, page: 0, pageSize: 100,
};
const $ = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
const path = () => `/profiles/${encodeURIComponent(state.id)}`;
const preferences = () => state.snapshot?.profile.properties.preferences.filter(p => !p.superseded_by) ?? [];
const displayName = () => state.snapshot?.profile.identity.name || "Your profile";
const contexts = () => [...new Set([
  ...preferences().flatMap(p => p.personas.map(a => a.persona)),
  ...(state.snapshot?.profile.identity.personas ?? []).map(p => p.name),
])].filter(Boolean).sort();
function remember(id: string) {
  try { if (id) localStorage.setItem(storageKey, id); else localStorage.removeItem(storageKey); } catch { /* URL still supports returning to this profile. */ }
  const url = new URL(location.href);
  if (id) url.searchParams.set("profile", id); else url.searchParams.delete("profile");
  history.replaceState(null, "", url);
}
function message(text = "", error = false, conflict = false) {
  const box = $("#notice");
  box.className = `notice ${error ? "notice-error" : "notice-success"}`;
  box.innerHTML = `${icon(error ? "alert" : "check")}<span title="${escape(text)}">${escape(text || "Ready.")}</span>${conflict ? '<button data-action="review-latest">Load latest & keep draft</button>' : ""}`;
}
async function discard() { return !state.dirty || await confirmAction({ title: "Discard unsaved changes?", message: "Your changes have not been saved.", danger: true }); }
function savedStatus() {
  const indicator = root.querySelector<HTMLElement>(".saved-indicator");
  if (!indicator) return;
  indicator.hidden = !state.snapshot;
  indicator.innerHTML = `<span></span>${state.saving ? "Saving…" : state.dirty ? "Unsaved changes" : "Saved to your profile"}`;
  indicator.classList.toggle("unsaved", state.dirty);
}
function markDirty() { state.dirty = true; savedStatus(); }
function setBusy(busy: boolean) {
  state.saving = busy;
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>("button, input, select, textarea").forEach(control => { control.disabled = busy; });
  root.setAttribute("aria-busy", String(busy));
  savedStatus();
  if (!busy && state.view === "preferences" && root.querySelector("#preference-list")) renderList();
}
async function save<T>(action: () => Promise<T>, success: string, after?: (result: T) => Promise<void>, form?: HTMLFormElement) {
  if (state.saving) return;
  setBusy(true); message();
  try {
    const result = await action();
    state.dirty = false;
    if (after) await after(result);
    else { state.editing = null; await load(state.id); }
    message(success);
  } catch (error) {
    const conflict = error instanceof ApiError && [409, 412].includes(error.status) && !error.fields;
    if (form?.isConnected && error instanceof ApiError && error.fields) showFieldErrors(form, error.fields, false);
    message(conflict ? "Your saved information changed. Your draft is safe. Load the latest version and review before saving again." : (error as Error).message, true, conflict && !!state.snapshot);
  } finally { setBusy(false); form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }
}

function shell() {
  root.innerHTML = `
    <a class="skip-link" href="#workspace">Skip to content</a>
    <header class="topbar"><a class="brand" href="/">QFF<span>Identity</span><span class="brand-dot"></span></a>
      <div class="header-page" id="header-page" hidden><h1 id="page-title"></h1><div class="heading-actions" id="page-actions"></div></div>
      <div class="header-account" id="header-account"></div></header>
    <div class="app-layout"><aside class="sidebar"><span class="nav-caption">YOUR SPACE</span>
      <nav aria-label="Main navigation">
        <button data-view="profile">${icon("profile")}My profile</button>
        <button data-view="preferences">${icon("preferences")}Preferences</button>
        <button data-view="contexts">${icon("contexts")}Contexts</button>
        <button data-view="buddy">${icon("buddy")}AI Buddy</button>
      </nav><div class="sidebar-bottom"><div class="avatar" id="avatar">Q</div><div><strong id="account-name">Your space</strong><small>In your own words</small></div></div>
    </aside><main id="workspace" tabindex="-1"><div id="content"></div></main></div>
    <footer class="statusbar" aria-label="Profile status"><div id="notice" class="notice notice-success" role="status" aria-live="polite">${icon("check")}<span>Ready.</span></div><span class="saved-indicator" aria-live="polite"></span></footer>
    <dialog id="profile-dialog" aria-labelledby="profile-dialog-title"><div class="dialog-header"><h2 id="profile-dialog-title">Open a profile</h2><button data-action="close-dialog" class="icon-button" aria-label="Close profile picker">×</button></div><p>Continue with information you've already saved.</p><form novalidate id="switch-form"><label>Saved profile<select name="profile" required id="profile-select"></select></label><button class="primary" type="submit">Open profile</button></form><button class="text-button" data-action="new-profile">Create a new profile</button></dialog>
    <dialog id="delete-dialog" aria-labelledby="delete-title" aria-describedby="delete-copy"><h2 id="delete-title">Confirm deletion</h2><p id="delete-copy"></p><div class="dialog-actions"><button data-action="cancel-delete">Keep it</button><button class="danger" data-action="confirm-delete">Delete permanently</button></div></dialog>`;
}

function account() {
  const name = displayName();
  $("#account-name").textContent = state.snapshot ? name : "Your space";
  $("#avatar").textContent = state.snapshot ? name.split(/\s+/).slice(0, 2).map(n => n[0]).join("").toUpperCase() : "Q";
  $("#header-account").innerHTML = state.snapshot
    ? `<button class="account-button" data-action="open-profiles">${escape(name)}<span aria-hidden="true">⌄</span></button>`
    : '<button data-action="open-profiles">Open saved profile</button>';
  $("#header-page").hidden = !state.snapshot;
  $("#page-title").textContent = state.view === "profile" ? "My profile" : state.view === "contexts" ? "My contexts" : state.view === "buddy" ? "AI Buddy" : "My preferences";
  $("#page-actions").innerHTML = !state.snapshot || state.view === "buddy" ? "" : state.view === "profile"
    ? `<button class="danger-outline" data-action="delete-profile">${icon("trash")}Delete profile</button><button class="primary" type="submit" form="identity-form">${icon("check")}Save profile</button>`
    : `<button class="primary" data-action="add-preference">${icon("plus")}Add preference</button>`;
  root.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.view === state.view && !!state.snapshot);
    if (button.dataset.view === state.view && state.snapshot) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  });
  savedStatus();
}

function welcome() {
  state.request++; state.snapshot = null; state.id = ""; state.editing = null; state.dirty = false; account();
  $("#content").dataset.view = "welcome";
  $("#content").innerHTML = `<section class="welcome"><div class="eyebrow">MY IDENTITY</div><h1>Your identity.<br/>In your own words.</h1><p>A place for what you enjoy, what you're working toward,<br class="desktop-only"/> and what matters to you. Start with your name.</p>
    <form novalidate id="create-form"><label>Your name<input name="name" autocomplete="name" maxlength="200" required placeholder="Enter your name" /></label><button class="primary" type="submit">Create my profile <span aria-hidden="true">→</span></button></form>
    <div class="welcome-return">Already started? <button class="text-button" data-action="open-profiles">Open your saved profile</button></div>
    <div class="welcome-note">You decide what to add. There are no questions to complete.</div></section>`;
}

async function load(id: string) {
  const request = ++state.request;
  const snapshot = await api<ProfileSnapshot>(`/profiles/${encodeURIComponent(id)}`);
  if (request !== state.request) return;
  state.id = id; state.snapshot = snapshot; state.dirty = false;
  remember(id); render();
}

function render() {
  account();
  $("#content").dataset.view = state.view;
  if (!state.snapshot) { welcome(); return; }
  if (state.view === "profile") renderProfile();
  else if (state.view === "contexts") renderContexts();
  else if (state.view === "buddy") {
    const id = state.id;
    renderBuddy($("#content"), id, async () => { if (state.id === id) await load(id); });
  }
  else renderPreferences();
}

function renderPreferences() {
  const scrollTop = root.querySelector(".preference-scroll")?.scrollTop ?? 0;
  $("#content").innerHTML = `<div class="editor-layout ${state.editing ? "has-editor" : ""}"><section class="preference-workspace" aria-label="Saved preferences">
      <div class="filter-tabs" role="group" aria-label="Filter preferences">${filterOptions.map(([value, label]) => `<button data-filter="${value}" aria-pressed="${state.filter === value}" class="${state.filter === value ? "selected" : ""}">${label}<span>${preferences().filter(p => matchesType(p, value) && matchesSearch(p)).length}</span></button>`).join("")}</div>
      <div class="search-row"><label class="search-label"><span class="sr-only">Search preferences</span><input id="search" type="search" value="${escape(state.search)}" placeholder="Search preferences" /></label><label class="context-filter"><span class="sr-only">Filter by context</span><select id="context-filter"><option value="all">All contexts</option><option value="">Identity-wide</option><option value="${unassignedContext}">Not set</option>${contexts().map(c => `<option value="${escape(c)}">${escape(c)}</option>`).join("")}</select></label></div>
      <div id="preference-list"></div>
    </section><aside id="preference-editor" class="editor-panel" aria-label="Preference editor" ${state.editing ? "" : "hidden"}></aside></div>`;
  $<HTMLSelectElement>("#context-filter").value = state.context;
  renderList();
  const scrollArea = root.querySelector(".preference-scroll");
  if (scrollArea) scrollArea.scrollTop = scrollTop;
  if (state.editing) renderEditor();
}

function matchesType(p: Preference, filter: string) {
  const affinities = state.context === "all" ? p.personas : p.personas.filter(a => a.persona === state.context);
  if (state.context === unassignedContext ? p.personas.length > 0 : state.context !== "all" && !affinities.length) return false;
  if (filter === "all") return true;
  if (filter === "likes") return p.kind === "interest" && affinities.some(a => a.affinity > 0);
  if (filter === "dislikes") return p.kind === "interest" && affinities.some(a => a.affinity < 0);
  return p.kind === filter;
}
function affinityIndicator({ persona, affinity }: Affinity) {
  const context = persona || "Identity-wide";
  const meaning = affinity < 0 ? "Against" : affinity > 0 ? "For" : "Neutral";
  const level = Math.round(Math.abs(affinity) * 10);
  const ticks = Array.from({ length: 21 }, (_, index) => {
    const step = index - 10;
    const color = step < 0 ? "negative" : step > 0 ? "positive" : "neutral";
    const active = step === 0 || (Math.sign(step) === Math.sign(affinity) && Math.abs(step) <= level);
    return `<span class="affinity-tick ${color}${active ? " active" : ""}"></span>`;
  }).join("");
  return `<div class="affinity-reading" title="${escape(context)}: ${meaning}"><span class="affinity-meter" role="meter" aria-label="${escape(context)} affinity" aria-valuemin="-1" aria-valuemax="1" aria-valuenow="${affinity}" aria-valuetext="${meaning}"><span class="affinity-ticks" aria-hidden="true">${ticks}</span></span><span class="affinity-context">${escape(context)}</span></div>`;
}
function matchesSearch(p: Preference) {
  return `${p.keyword} ${p.definition}`.toLowerCase().includes(state.search.trim().toLowerCase());
}
function filteredPreferences() { return preferences().filter(p => matchesType(p, state.filter) && matchesSearch(p)); }
function renderList() {
  root.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach(button => {
    button.querySelector("span")!.textContent = String(preferences().filter(p => matchesType(p, button.dataset.filter!) && matchesSearch(p)).length);
  });
  const filtered = filteredPreferences();
  const list = $("#preference-list");
  const pageSize = state.pageSize;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  state.page = Math.min(state.page, pages - 1);
  const start = state.page * pageSize;
  list.innerHTML = (!filtered.length
    ? `<div class="empty-state"><div class="empty-symbol" aria-hidden="true">+</div><h2>${!preferences().length ? "What makes you, you?" : state.search.trim() || state.context !== "all" ? "No matching preferences" : `No ${filterOptions.find(([value]) => value === state.filter)![1].toLowerCase()} yet`}</h2><p>${!preferences().length ? "Add a like, a goal, a value, or a boundary." : state.search.trim() || state.context !== "all" ? "Try a different search or context." : "Add a preference whenever you’re ready."}</p>${state.search.trim() || state.context !== "all" ? '<button data-action="clear-filters">Clear filters</button>' : '<button data-action="add-preference">Add a preference</button>'}</div>`
    : `<div class="preference-scroll" role="region" aria-label="Preference list" tabindex="0"><div class="preference-table"><div class="table-heading"><span>Preference</span><span>Category</span><span class="affinity-heading" title="Against · Neutral · For">Affinity</span><span class="sr-only">Actions</span></div>${filtered.slice(start, start + pageSize).map(p => {
      const affinities = state.context === "all" ? p.personas : p.personas.filter(a => a.persona === state.context);
      const positive = affinities.some(a => a.affinity > 0), negative = affinities.some(a => a.affinity < 0);
      const label = p.kind === "interest" ? (positive && negative ? "Mixed interest" : negative ? "Dislike" : positive ? "Like" : "Interest") : p.want_type === "goal" ? "Goal" : p.want_type === "wish" ? "Want" : labels[p.kind];
      return `<article data-preference-id="${p.preference_id}" class="preference-row ${state.highlighted === p.preference_id ? "is-saved" : ""} ${state.editing?.preference_id === p.preference_id ? "is-editing" : ""}"><button class="row-content" data-edit="${escape(p.preference_id)}"><strong>${escape(p.keyword)}</strong><span>${escape(p.definition)}</span></button><div class="row-meta"><span class="category category-${p.kind}">${label}</span></div><div class="row-affinities">${affinities.length ? affinities.map(affinityIndicator).join("") : '<span class="affinity-empty">Not set</span>'}</div><button class="icon-button edit-button" data-edit="${escape(p.preference_id)}" aria-label="Edit ${escape(p.keyword)}">${icon("edit")}</button></article>`;
    }).join("")}</div></div>`)
    + `<div class="list-pagination"><span>${filtered.length ? `${start + 1}–${Math.min(start + pageSize, filtered.length)} of ${filtered.length}` : "0"} ${filtered.length === 1 ? "preference" : "preferences"}</span><label class="page-size">Per page<select id="page-size" aria-label="Preferences per page">${[10, 50, 100, 200].map(size => `<option value="${size}" ${size === pageSize ? "selected" : ""}>${size}</option>`).join("")}</select></label>${pages > 1 ? `<div class="page-navigation"><button class="icon-button" data-action="previous-page" aria-label="Previous preferences" ${state.page === 0 ? "disabled" : ""}>${icon("left")}</button><span>Page ${state.page + 1} of ${pages}</span><button class="icon-button" data-action="next-page" aria-label="Next preferences" ${state.page === pages - 1 ? "disabled" : ""}>${icon("right")}</button></div>` : ""}</div>`;
}

function affinityRow(a: Affinity, index: number) {
  return `<div class="affinity-row"><label>Context<input name="persona" data-error-key="personas.${index}.persona" maxlength="120" value="${escape(a.persona)}" placeholder="Identity-wide" list="context-options" /></label><label><span>Affinity <output>${a.affinity}</output></span><input name="affinity" data-error-key="personas.${index}.affinity" type="range" min="-1" max="1" step="0.01" value="${a.affinity}" aria-label="Affinity for context ${index + 1}" /></label><button class="icon-button" type="button" data-action="remove-context" aria-label="Remove context ${index + 1}">${icon("close")}</button></div>`;
}
function renderEditor() {
  const p = state.editing!;
  $("#preference-editor").innerHTML = `<div class="panel-heading"><h2>${p.preference_id ? "Edit preference" : "Add a preference"}</h2><button class="icon-button" data-action="close-editor" aria-label="Close editor">${icon("close")}</button></div>
    <form novalidate id="preference-form"><div class="editor-fields"><label>Title<textarea name="keyword" aria-label="Title" rows="1" maxlength="120" required placeholder="What would you like to record?">${escape(p.keyword)}</textarea></label><label>Description<textarea name="definition" aria-label="Description" rows="3" maxlength="4000" required placeholder="Describe it in your own words.">${escape(p.definition)}</textarea></label><label>Category<select name="kind" aria-label="Category">${Object.entries(labels).map(([k, l]) => `<option value="${k}" ${p.kind === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <section class="context-fields"><div class="section-heading"><h3>Where this applies</h3><button class="text-button" type="button" data-action="add-context">${icon("plus")}Add context</button></div><p class="field-help">${p.personas.length ? "An empty Context name applies identity-wide." : "No Context or Affinity is set. Add a context to set one."}</p><datalist id="context-options">${contexts().map(c => `<option value="${escape(c)}"></option>`).join("")}</datalist><div id="affinities">${p.personas.map(affinityRow).join("")}</div><div class="affinity-key" ${p.personas.length ? "" : "hidden"}><span>−1 · Against</span><span>0 · Neutral</span><span>+1 · For</span></div></section></div>
      <div class="editor-footer">${p.preference_id ? `<button class="icon-button danger-text" type="button" data-action="delete-preference" aria-label="Delete preference" title="Delete preference">${icon("trash")}</button>` : ""}<button type="button" data-action="close-editor">Cancel</button><button class="primary" type="submit">${icon("check")}Save preference</button></div></form>`;
}

function updateContextRows() {
  const form = $<HTMLFormElement>("#preference-form");
  form.querySelectorAll<HTMLInputElement>("#affinities input").forEach(clearFieldError);
  const rows = [...form.querySelectorAll(".affinity-row")];
  rows.forEach((row, index) => {
    row.querySelector<HTMLElement>('[name="persona"]')!.dataset.errorKey = `personas.${index}.persona`;
    const slider = row.querySelector<HTMLElement>('[name="affinity"]')!;
    slider.dataset.errorKey = `personas.${index}.affinity`;
    slider.setAttribute("aria-label", `Affinity for context ${index + 1}`);
    row.querySelector("button")!.setAttribute("aria-label", `Remove context ${index + 1}`);
  });
  $(".affinity-key").hidden = !rows.length;
  $(".context-fields .field-help").textContent = rows.length ? "An empty Context name applies identity-wide." : "No Context or Affinity is set. Add a context to set one.";
  if ($("#notice").classList.contains("notice-error") && !root.querySelector('[aria-invalid="true"]')) message();
}

function renderProfile() {
  const identity = state.snapshot!.profile.identity;
  $("#content").innerHTML = `<form novalidate id="identity-form" class="profile-form"><section class="form-section"><div class="section-heading"><h2>About you</h2></div><div class="form-fields"><label>Name<input name="name" autocomplete="name" maxlength="200" value="${escape(identity.name)}" /></label><label>About me<textarea name="summary" aria-label="About me" maxlength="4000" rows="3" placeholder="Describe yourself in your own words.">${escape(identity.summary)}</textarea></label><div class="field-pair"><label>Location<input name="location" maxlength="200" value="${escape(identity.location)}" /></label><label>Occupation<input name="occupation" maxlength="200" value="${escape(identity.occupation)}" /></label></div><div class="field-pair"><label>Age<input name="age" type="number" min="0" max="150" step="1" value="${escape(identity.age)}" /></label><label>Gender<input name="gender" maxlength="200" value="${escape(identity.gender)}" /></label></div><p class="field-help">All fields are optional. Clear a field to remove it.</p></div></section>
      <section class="form-section"><div class="section-heading"><h2>More about me</h2><button type="button" class="text-button" data-action="add-detail">${icon("plus")}Add personal detail</button></div><p class="field-help">Your own fields, in your own words.</p><div id="personal-details">${(identity.details ?? []).map(detailRow).join("")}</div></section></form>`;
}
function detailRow(detail: PersonalDetail, index: number) {
  return `<div class="detail-row"><label>Label<input name="detail-label" data-error-key="details.${index}.label" maxlength="120" required placeholder="What is this about?" value="${escape(detail.label)}" /></label><label>Your information<textarea name="detail-value" data-error-key="details.${index}.value" aria-label="Your information" rows="2" maxlength="4000" required>${escape(detail.value)}</textarea></label><button type="button" class="icon-button" data-action="remove-detail" aria-label="Remove personal detail">×</button></div>`;
}
function updateDetailRows() {
  root.querySelectorAll(".detail-row").forEach((row, index) => {
    row.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea").forEach(control => {
      clearFieldError(control);
      control.dataset.errorKey = `details.${index}.${control.name === "detail-label" ? "label" : "value"}`;
    });
  });
}
function renderContexts() {
  const names = ["", unassignedContext, ...contexts()];
  $("#content").innerHTML = `<div class="context-list">${names.map(name => {
    const count = preferences().filter(p => name === unassignedContext ? !p.personas.length : p.personas.some(a => a.persona === name)).length;
    return `<button class="context-card" data-context="${escape(name)}"><div class="context-card-symbol" aria-hidden="true">${name === unassignedContext ? "—" : name ? escape(name[0].toUpperCase()) : "◎"}</div><div><h2>${escape(name === unassignedContext ? "Not set" : name || "Identity-wide")}</h2><p>${count} ${count === 1 ? "preference" : "preferences"}${name ? "" : " · Across every part of your life"}</p></div><span aria-hidden="true">→</span></button>`;
  }).join("")}</div><p class="workspace-footnote">To add a context, give it a name while editing a preference. No persona is required.</p>`;
}

async function openProfiles() {
  const { profile_ids } = await api<{ profile_ids: string[] }>("/profiles");
  const profiles = await Promise.all(profile_ids.map(async id => {
    const snapshot = id === state.id ? state.snapshot! : await api<ProfileSnapshot>(`/profiles/${encodeURIComponent(id)}`);
    return { id, name: snapshot.profile.identity.name || `Unnamed profile (${id})` };
  }));
  $("#profile-select").innerHTML = '<option value="">Choose a saved profile</option>' + profiles.map(p => `<option value="${escape(p.id)}">${escape(p.name)}</option>`).join("");
  $<HTMLSelectElement>("#profile-select").value = state.id;
  $<HTMLDialogElement>("#profile-dialog").showModal();
}
async function openEditor(preference?: Preference) {
  if (!(await discard())) return;
  state.view = "preferences"; state.dirty = false;
  const kind = ["want", "value", "boundary"].includes(state.filter) ? state.filter as PreferenceInput["kind"] : "interest";
  state.editing = preference ? structuredClone(preference) : { keyword: "", definition: "", kind, personas: state.context === unassignedContext ? [] : [{ persona: state.context === "all" ? "" : state.context, affinity: state.filter === "dislikes" ? -1 : 1 }] };
  message();
  render(); $<HTMLInputElement>('#preference-form [name="keyword"]').focus();
}
function removeDialog(profile: boolean) {
  state.removing = profile ? "profile" : state.editing?.preference_id ?? "";
  $("#delete-title").textContent = profile ? `Delete “${displayName()}”?` : `Delete “${state.editing?.keyword}”?`;
  $("#delete-copy").textContent = profile ? "This permanently deletes your identity information, preferences, relations, Buddy conversations, diary and recommendations. This cannot be undone." : "This permanently removes the saved preference. Your other preferences will stay unchanged.";
  $<HTMLDialogElement>("#delete-dialog").showModal();
}

root.addEventListener("click", async event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!button || state.saving) return;
  try {
    if (button.dataset.view) {
      if (!state.snapshot || !(await discard())) return;
      state.view = button.dataset.view; state.editing = null; state.dirty = false; message(); render(); return;
    }
    if (button.dataset.edit) { await openEditor(preferences().find(p => p.preference_id === button.dataset.edit)); return; }
    if (button.dataset.filter) {
      state.filter = button.dataset.filter; state.page = 0;
      root.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach(b => { b.classList.toggle("selected", b === button); b.setAttribute("aria-pressed", String(b === button)); });
      renderList(); return;
    }
    if (button.dataset.context !== undefined) { state.context = button.dataset.context; state.view = "preferences"; state.filter = "all"; state.search = ""; state.page = 0; render(); return; }
    switch (button.dataset.action) {
      case "add-preference": await openEditor(); break;
      case "previous-page": state.page = Math.max(0, state.page - 1); renderList(); break;
      case "next-page": state.page++; renderList(); break;
      case "close-editor": if (await discard()) { state.editing = null; state.dirty = false; message(); render(); $("[data-action=add-preference]").focus(); } break;
      case "clear-filters": state.filter = "all"; state.search = ""; state.context = "all"; state.page = 0; if (!state.editing) render(); else { $<HTMLInputElement>("#search").value = ""; $<HTMLSelectElement>("#context-filter").value = "all"; root.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach(b => { b.classList.toggle("selected", b.dataset.filter === "all"); b.setAttribute("aria-pressed", String(b.dataset.filter === "all")); }); renderList(); } break;
      case "add-context": $("#affinities").insertAdjacentHTML("beforeend", affinityRow({ persona: "", affinity: 1 }, $("#affinities").children.length)); updateContextRows(); markDirty(); break;
      case "remove-context": button.closest(".affinity-row")?.remove(); updateContextRows(); markDirty(); break;
      case "add-detail": $("#personal-details").insertAdjacentHTML("beforeend", detailRow({ label: "", value: "" }, $("#personal-details").children.length)); updateDetailRows(); markDirty(); break;
      case "remove-detail": button.closest(".detail-row")?.remove(); updateDetailRows(); markDirty(); break;
      case "open-profiles": await openProfiles(); break;
      case "close-dialog": $<HTMLDialogElement>("#profile-dialog").close(); break;
      case "new-profile": if (await discard()) { $<HTMLDialogElement>("#profile-dialog").close(); remember(""); welcome(); message(); } break;
      case "delete-preference": removeDialog(false); break;
      case "delete-profile": removeDialog(true); break;
      case "cancel-delete": $<HTMLDialogElement>("#delete-dialog").close(); break;
      case "confirm-delete": {
        $<HTMLDialogElement>("#delete-dialog").close();
        const profile = state.removing === "profile";
        await save(() => api(profile ? path() : `${path()}/preferences/${encodeURIComponent(state.removing)}`, "DELETE", undefined, profile ? state.snapshot!.profile_revision : state.snapshot!.revision), profile ? "Your profile has been deleted." : "Preference deleted.", profile ? async () => { clearBuddyProfile(state.id); remember(""); welcome(); } : undefined);
        break;
      }
      case "review-latest": {
        state.snapshot = await api<ProfileSnapshot>(path());
        if (state.view === "preferences") renderList();
        message("Latest information loaded. Your draft is unchanged. Review it before saving again."); break;
      }
    }
  } catch (error) { message((error as Error).message, true); }
});

root.addEventListener("input", event => {
  const input = event.target as HTMLInputElement;
  if (input.id === "page-size") {
    const pageSize = Number(input.value);
    if (![10, 50, 100, 200].includes(pageSize)) return;
    state.page = Math.floor(state.page * state.pageSize / pageSize);
    state.pageSize = pageSize;
    renderList(); $("#page-size").focus({ preventScroll: true }); return;
  }
  if (input.id === "search") { state.search = input.value; state.page = 0; renderList(); return; }
  if (input.id === "context-filter") {
    state.context = input.value; state.page = 0;
    renderList(); return;
  }
  if (input.closest("#preference-form, #identity-form, #create-form")) { clearFieldError(input); if ($("#notice").classList.contains("notice-error") && !root.querySelector('[aria-invalid="true"]')) message(); markDirty(); }
  if (input.name === "affinity") input.closest("label")!.querySelector("output")!.textContent = input.value;
});

root.addEventListener("submit", async event => {
  event.preventDefault();
  if (state.saving) return;
  const form = event.target as HTMLFormElement;
  if (!["create-form", "switch-form", "preference-form", "identity-form"].includes(form.id)) return;
  if (!validateForm(form)) { message("Check the highlighted fields.", true); return; }
  const fields = new FormData(form);
  const value = (name: string) => String(fields.get(name) ?? "").trim();
  if (form.id === "create-form") {
    const name = value("name");
    if (!name) { message("Enter your name to create a profile.", true); return; }
    const id = crypto.randomUUID();
    await save(() => api("/profiles", "POST", { external_id: id, identity: { name }, properties: { preferences: [] }, relations: { relations: [] } }), "Your profile is ready. Add your first preference whenever you like.", async () => { state.view = "preferences"; await load(id); });
  } else if (form.id === "switch-form") {
    if (!(await discard())) return;
    $<HTMLDialogElement>("#profile-dialog").close();
    try { state.editing = null; state.filter = "all"; state.context = "all"; state.search = ""; state.page = 0; await load(value("profile")); message(); } catch (error) { message((error as Error).message, true); }
  } else if (form.id === "preference-form") {
    const input: PreferenceInput = { keyword: value("keyword"), definition: value("definition"), kind: value("kind") as PreferenceInput["kind"], personas: [...form.querySelectorAll(".affinity-row")].map(row => ({ persona: row.querySelector<HTMLInputElement>('[name="persona"]')!.value.trim(), affinity: Number(row.querySelector<HTMLInputElement>('[name="affinity"]')!.value) })) };
    const id = state.editing!.preference_id;
    if (input.kind === "want" && state.editing?.want_type) input.want_type = state.editing.want_type;
    const errors = preferenceErrors(input);
    const current = preferences().find(p => p.preference_id === id);
    const duplicate = newPreferenceDuplicate(input, preferences(), current);
    if (duplicate) errors.keyword = `“${duplicate.keyword}” already has the same title or description in this Category and Context. Edit it instead.`;
    if (Object.keys(errors).length) { showFieldErrors(form, errors); message("Check the highlighted fields.", true); return; }
    await save(() => api<{ preference_id?: string }>(`${path()}/preferences${id ? `/${encodeURIComponent(id)}` : ""}`, id ? "PUT" : "POST", input, state.snapshot!.revision), "Preference saved.", async result => {
      state.editing = null;
      await load(state.id);
      const savedId = id || result.preference_id!;
      if (!filteredPreferences().some(p => p.preference_id === savedId)) { state.filter = "all"; state.context = "all"; state.search = ""; }
      state.page = Math.floor(filteredPreferences().findIndex(p => p.preference_id === savedId) / state.pageSize);
      state.highlighted = savedId;
      render();
      requestAnimationFrame(() => {
        const row = root.querySelector<HTMLElement>(`[data-preference-id="${savedId}"]`);
        row?.scrollIntoView({ block: "nearest" });
        row?.querySelector<HTMLElement>(".row-content")?.focus({ preventScroll: true });
      });
    }, form);
  } else if (form.id === "identity-form") {
    const input: Record<string, unknown> = Object.fromEntries(["name", "summary", "location", "occupation", "gender"].map(key => [key, value(key) || null]));
    input.age = value("age") ? Number(value("age")) : null;
    input.details = [...form.querySelectorAll(".detail-row")].map(row => ({ label: row.querySelector<HTMLInputElement>('[name="detail-label"]')!.value.trim(), value: row.querySelector<HTMLTextAreaElement>('[name="detail-value"]')!.value.trim() }));
    await save(() => api(`${path()}/identity`, "PATCH", input, state.snapshot!.identity_revision), "Profile saved.", undefined, form);
  }
});
window.addEventListener("beforeunload", event => { if (state.dirty) { event.preventDefault(); event.returnValue = ""; } });

shell();
root.querySelectorAll("dialog").forEach(keepDialogFocus);
welcome();
let saved = "";
try { saved = localStorage.getItem(storageKey) ?? ""; } catch { /* Storage can be disabled. */ }
const selected = new URL(location.href).searchParams.get("profile") ?? saved;
if (selected) {
  $("#content").innerHTML = '<div class="loading-state" role="status">Loading your profile…</div>';
  load(selected).catch(error => { welcome(); if (error instanceof ApiError && error.status === 404) remember(""); message((error as Error).message, true); });
}
