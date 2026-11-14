/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { store } from "../data/store";
import { preferenceKinds, type Person, type Preference } from "../data/types";
import { personaGroups, removePreferenceUse, type PersonaGroup } from "../data/preferences";
import { esc, openInfo, q } from "../shared/dom";
import { refreshEmbeddings } from "../shared/embeddingRefresh";

let selectedIdentity: string | undefined;

function embeddingStatus(pref: Preference, dimensions: number): string {
  if (!pref.definition?.trim()) return "Needs definition";
  return pref.embedding?.length === dimensions && pref.embedding.every(Number.isFinite) ? "Available" : "Needs embedding";
}

export function render(root: HTMLElement): () => void {
  let disposed = false;
  const expanded = new Set<string>();
  const names = store.people.map(person => ({
    person,
    label: store.people.filter(other => other.identity.name === person.identity.name).length > 1
      ? `${person.identity.name} (${person.id})`
      : person.identity.name,
  }));
  selectedIdentity = store.person(selectedIdentity ?? "")?.id ?? store.people[0]?.id;
  root.classList.add("preferences-edit-page");
  root.innerHTML = `
    <div class="toolbar">
      <h2>Preferences: Edit <button class="info-btn" title="How to edit preferences" aria-label="How to edit preferences">ⓘ</button></h2>
      <label>Identity <input class="identity-search" type="search" list="preference-identities" autocomplete="off" placeholder="Search or select identity" /></label>
      <datalist id="preference-identities">${names.map(item => `<option value="${esc(item.label)}"></option>`).join("")}</datalist>
      <button class="refresh">Refresh embeddings</button>
      <span class="hint model"></span>
    </div>
    <p class="message" role="status" aria-live="polite"></p>
    <div class="mode-editor"></div>`;
  q(root, ".info-btn").addEventListener("click", () => openInfo("Editing preferences", `
    <p>Select an identity and expand a persona to edit its preferences. Global Save and Reload include preference edits and other pending changes. Drafts survive menu navigation.</p>
    <p>Add existing preferences to more than one persona. Keyword, definition and kind are shared; affinity is specific to each persona. Removing a preference from its last persona deletes it.</p>
    <p>Keyword or definition changes clear the preference embedding. Save and refresh embeddings; the refresh also verifies all identities and modes and recalculates mode averages. Uncached texts require Azure and internet access.</p>`));
  const search = q<HTMLInputElement>(root, ".identity-search");
  const list = q(root, ".mode-editor");
  const message = q(root, ".message");
  const refresh = q<HTMLButtonElement>(root, ".refresh");
  search.value = names.find(item => item.person.id === selectedIdentity)?.label ?? "";
  let groups: PersonaGroup[] = [];

  const report = (text: string, error = false) => {
    message.textContent = text;
    message.hidden = !text;
    message.classList.toggle("mode-error", error);
  };
  const owner = (): Person | undefined => store.person(selectedIdentity ?? "");
  const controls = () => {
    refresh.disabled = !owner() || store.busy || store.dirtyCount > 0;
    refresh.title = store.dirtyCount ? "Save or reload all pending edits first." : "Refresh embeddings for all identities and modes.";
  };
  const resize = (container: ParentNode) => {
    container.querySelectorAll<HTMLTextAreaElement>("textarea").forEach((textarea) => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight + 2}px`;
    });
  };
  const draw = () => {
    const person = owner();
    q(root, ".model").textContent = person ? `${person.properties.embedding_model.name} · ${person.properties.embedding_model.dimensions} dimensions` : "";
    if (!person) {
      list.innerHTML = "";
      report(store.people.length ? "Select an identity from the list." : "No identities available.");
      controls();
      return;
    }
    groups = personaGroups(person);
    list.innerHTML = groups.map((group, gi) => {
      const { persona: name, preferences: prefs } = group;
      const available = person.properties.preferences.map((pref, index) => ({ pref, index }))
        .filter(({ pref }) => !pref.personas.some(membership => membership.persona === name));
      return `<details data-group="${gi}" ${expanded.has(name) ? "open" : ""}>
        <summary><b>${esc(name)}</b> · ${prefs.length} preference${prefs.length === 1 ? "" : "s"}</summary>
        <table class="mini mode-submodes">
          <colgroup><col /><col /><col class="kind-col" /><col class="affinity-col" /><col class="embedding-col" /><col class="delete-col" /></colgroup>
          <thead><tr><th>Keyword</th><th>Definition</th><th>Kind</th><th>Affinity</th><th>Embedding</th><th></th></tr></thead>
          <tbody>${prefs.map(({ pref, membership }, i) => `<tr data-preference="${i}">
            <td><textarea rows="1" data-field="keyword" aria-label="${esc(name)} preference ${i + 1} keyword">${esc(pref.keyword)}</textarea></td>
            <td><textarea rows="1" data-field="definition" aria-label="${esc(name)} preference ${i + 1} definition">${esc(pref.definition ?? "")}</textarea></td>
            <td><select data-field="kind" aria-label="${esc(name)} preference ${i + 1} kind">${preferenceKinds.map(kind => `<option value="${kind}" ${pref.kind === kind ? "selected" : ""}>${kind}</option>`).join("")}</select></td>
            <td><input type="number" min="-1" max="1" step="0.1" data-field="affinity" aria-label="${esc(name)} preference ${i + 1} affinity" value="${membership.affinity}" /></td>
            <td class="embedding-status" title="Vector presence and dimensions only; freshness is checked by Embeddings → Update.">${embeddingStatus(pref, person.properties.embedding_model.dimensions)}</td>
            <td><button class="danger" data-action="delete">Delete</button></td>
          </tr>`).join("")}</tbody>
        </table>
        <div class="add-preference">
          <input class="new-keyword" aria-label="New ${esc(name)} preference keyword" placeholder="New keyword" />
          <input class="new-definition" aria-label="New ${esc(name)} preference definition" placeholder="New definition" />
          <button data-action="add">Add preference</button>
        </div>
        ${available.length
          ? `<div class="add-preference">
          <label>Add existing <select class="existing" aria-label="Existing preference for ${esc(name)}">
            <option value="">Select preference</option>${available.map(({ pref, index }) => `<option value="${index}">${esc(pref.keyword)} · ${esc(pref.kind)} · ${esc(pref.definition ?? "(no definition)")}</option>`).join("")}
          </select></label>
          <button data-action="add-existing">Add to persona</button>
        </div>`
          : ""}
      </details>`;
    }).join("") || "<p class=\"hint\">This identity has no personas.</p>";
    list.querySelectorAll<HTMLDetailsElement>("details").forEach(detail => detail.addEventListener("toggle", () => {
      const name = groups[Number(detail.dataset.group)].persona;
      if (detail.open) expanded.add(name); else expanded.delete(name);
      if (detail.open) resize(detail);
    }));
    list.querySelectorAll<HTMLDetailsElement>("details[open]").forEach(resize);
    report("");
    controls();
  };
  search.addEventListener("input", () => {
    selectedIdentity = names.find(item => item.label === search.value)?.person.id;
    expanded.clear();
    draw();
  });
  list.addEventListener("input", (event) => {
    if (event.target instanceof HTMLTextAreaElement) resize(event.target.parentElement!);
  });
  const edit = (event: Event) => {
    const person = owner();
    if (!person || store.busy || !(event.target instanceof HTMLElement)) return;
    const target = event.target;
    if (event.type === "input" && !(target instanceof HTMLTextAreaElement)) return;
    const detail = target.closest<HTMLDetailsElement>("details");
    const row = target.closest<HTMLTableRowElement>("tr[data-preference]");
    if (!detail || !row) return;
    const use = groups[Number(detail.dataset.group)].preferences[Number(row.dataset.preference)];
    if (!use) return;
    const { pref, membership } = use;
    if (target instanceof HTMLTextAreaElement && (target.dataset.field === "keyword" || target.dataset.field === "definition")) {
      const field = target.dataset.field;
      if (!target.value.trim()) {
        if (event.type === "input") return;
        target.value = pref[field] ?? "";
        resize(target.parentElement!);
        report(`${field === "keyword" ? "Keyword" : "Definition"} cannot be empty.`, true);
        return;
      }
      if (target.value !== pref[field]) {
        pref[field] = target.value;
        pref.embedding = null;
      }
    }
    else if (target instanceof HTMLInputElement && target.dataset.field === "affinity") {
      if (!Number.isFinite(target.valueAsNumber) || target.valueAsNumber < -1 || target.valueAsNumber > 1) {
        target.value = String(membership.affinity);
        report("Affinity must be between -1 and 1.", true);
        return;
      }
      membership.affinity = target.valueAsNumber;
    }
    else if (target instanceof HTMLSelectElement && target.dataset.field === "kind") {
      const kind = preferenceKinds.find(value => value === target.value);
      if (!kind) {
        target.value = pref.kind;
        report("Select a valid preference kind.", true);
        return;
      }
      pref.kind = kind;
    }
    else return;
    q(row, ".embedding-status").textContent = embeddingStatus(pref, person.properties.embedding_model.dimensions);
    list.querySelectorAll<HTMLTableRowElement>("tr[data-preference]").forEach((other) => {
      if (other === row) return;
      const otherDetail = other.closest<HTMLDetailsElement>("details");
      if (!otherDetail || groups[Number(otherDetail.dataset.group)].preferences[Number(other.dataset.preference)]?.pref !== pref) return;
      q<HTMLTextAreaElement>(other, "[data-field=\"keyword\"]").value = pref.keyword;
      q<HTMLTextAreaElement>(other, "[data-field=\"definition\"]").value = pref.definition ?? "";
      q<HTMLSelectElement>(other, "[data-field=\"kind\"]").value = pref.kind;
      q(other, ".embedding-status").textContent = embeddingStatus(pref, person.properties.embedding_model.dimensions);
      resize(other);
    });
    const preferenceIndex = person.properties.preferences.indexOf(pref);
    list.querySelectorAll<HTMLSelectElement>("select.existing").forEach((select) => {
      const option = [...select.options].find(item => item.value === String(preferenceIndex));
      if (option) option.textContent = `${pref.keyword} · ${pref.kind} · ${pref.definition ?? "(no definition)"}`;
    });
    store.touch(person.properties);
    const file = store.files.find(item => item.content === person.properties);
    report(file && store.isDirty(file) ? "Unsaved preference edits." : "");
  };
  list.addEventListener("input", edit);
  list.addEventListener("change", edit);
  list.addEventListener("click", (event) => {
    const person = owner();
    if (!person || store.busy || !(event.target instanceof HTMLButtonElement)) return;
    const detail = event.target.closest<HTMLDetailsElement>("details");
    if (!detail) return;
    const entry = groups[Number(detail.dataset.group)];
    if (event.target.dataset.action === "add") {
      const keyword = q<HTMLInputElement>(detail, ".new-keyword").value.trim();
      const definition = q<HTMLInputElement>(detail, ".new-definition").value.trim();
      if (!keyword || !definition) {
        report("Enter a keyword and definition before adding a preference.", true);
        return;
      }
      const pref = store.newPreference(person, keyword, "interest", entry.persona, 0.5);
      pref.definition = definition;
      person.properties.preferences.push(pref);
    }
    else if (event.target.dataset.action === "add-existing") {
      const value = q<HTMLSelectElement>(detail, ".existing").value;
      const pref = value === "" ? undefined : person.properties.preferences[Number(value)];
      if (!pref || pref.personas.some(membership => membership.persona === entry.persona)) {
        report("Select an available preference.", true);
        return;
      }
      pref.personas.push({ persona: entry.persona, affinity: 0.5 });
    }
    else if (event.target.dataset.action === "delete") {
      const row = event.target.closest<HTMLTableRowElement>("tr[data-preference]");
      if (!row || !confirm("Remove this preference from this persona? Removing its last persona deletes the preference.")) return;
      const use = entry.preferences[Number(row.dataset.preference)];
      if (!use) return;
      removePreferenceUse(person, use);
    }
    else return;
    store.touch(person.properties);
    expanded.add(entry.persona);
    draw();
    report("Unsaved preference edits.");
  });
  refresh.addEventListener("click", () => {
    const person = owner();
    if (!person || store.busy || store.dirtyCount) return;
    if (!confirm("Refresh embeddings for all identities and modes? Uncached texts require internet/Azure.")) return;
    void store.runExclusive(() => refreshEmbeddings(person.properties.embedding_model.dimensions, (text) => {
      if (!disposed) report(text);
    })).then(() => {
      if (!disposed) report("Embeddings refreshed and mode averages recalculated offline.");
    }).catch((err: unknown) => {
      const text = err instanceof Error ? err.message : String(err);
      if (!disposed) report(text, true);
      else alert(text);
    });
  });
  const onResize = () => list.querySelectorAll<HTMLDetailsElement>("details[open]").forEach(resize);
  window.addEventListener("resize", onResize);
  store.addEventListener("dirty", controls);
  draw();
  return () => {
    disposed = true;
    root.classList.remove("preferences-edit-page");
    store.removeEventListener("dirty", controls);
    window.removeEventListener("resize", onResize);
  };
}
