/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */
// Real browser → Vite proxy → Functions → repository files. All writes use a
// disposable, initially empty directory, never the checked-in identity records.
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { startBuddyProvider, checkBuddy } from "./buddy-browser-check.mjs";
import { checkEditorRegressions } from "./editor-browser-check.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const temp = await mkdtemp(join(tmpdir(), "qff-editor-browser-"));
const backend = "http://127.0.0.1:17181";
const frontend = "http://127.0.0.1:15181";
const processes = [];
let browser;
let buddyProvider;
function start(command, args, cwd, env) {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", data => { logs = (logs + data).slice(-6000); });
  child.on("error", error => { logs += error.message; });
  processes.push(child);
  return { child, logs: () => logs };
}
async function ready(url, service) {
  for (let n = 0; n < 100; n++) {
    if (service.child.exitCode !== null) throw new Error(service.logs());
    try { if ((await fetch(url)).ok) return; } catch { /* Host is still starting. */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`Server did not start: ${service.logs()}`);
}
try {
  buddyProvider = await startBuddyProvider();
  const apiHost = start("func", ["start", "--address", "127.0.0.1", "--port", "17181"], resolve(here, "../IdentityRepository"), { FUNCTIONS_WORKER_RUNTIME: "node", QFF_FIXTURE_MODE: "1", QFF_IDENTITY_ROOT: temp, QFF_AI_MODE: "live", LLM_BASE_URL: buddyProvider.url, LLM_MODEL: "browser-test", LLM_API_KEY: "", LLM_TIMEOUT_MS: "10000" });
  const vite = start(process.execPath, [join(dirname(require.resolve("vite/package.json")), "bin/vite.js"), "--host", "127.0.0.1", "--port", "15181", "--strictPort"], here, { QFF_IDENTITY_API_URL: backend });
  await Promise.all([ready(`${backend}/api/v1/profiles`, apiHost), ready(frontend, vite)]);
  assert.deepEqual(await (await fetch(`${backend}/api/v1/profiles`)).json(), { profile_ids: [] });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  await page.goto(frontend);
  await page.getByLabel("Your name", { exact: true }).fill("Browser test");
  await page.getByRole("button", { name: "Create my profile" }).click();
  await page.getByText("Your profile is ready.", { exact: false }).waitFor();
  assert.equal(await page.locator(".statusbar #notice").count(), 1, "Feedback belongs in the status bar");
  assert.equal(await page.locator("nav button svg").count(), 4, "Every navigation item has a consistent vector icon");
  for (const [menu, heading] of [["My profile", "My profile"], ["Contexts", "My contexts"], ["Preferences", "My preferences"]]) {
    await page.getByRole("button", { name: menu, exact: true }).click();
    assert.equal(await page.locator(".topbar h1").innerText(), heading, "The top bar follows the selected page");
    assert.equal(await page.locator("#content h1").count(), 0, "The content does not repeat the page heading");
  }
  const id = new URL(page.url()).searchParams.get("profile");
  assert(id);
  const file = kind => join(temp, id, `${id}-${kind}.json`);
  const saved = async () => (await (await fetch(`${backend}/api/v1/profiles/${id}`)).json());
  const rowFor = title => page.locator(".preference-row").filter({ has: page.getByRole("button", { name: `Edit ${title}`, exact: true }) });
  async function checkGauge(title, context, value, negative, positive) {
    const meter = rowFor(title).getByRole("meter", { name: `${context} affinity`, exact: true });
    assert.equal(await meter.getAttribute("aria-valuenow"), String(value));
    assert.equal(await meter.getAttribute("aria-valuemin"), "-1");
    assert.equal(await meter.getAttribute("aria-valuemax"), "1");
    assert.equal(await meter.locator(".negative").count(), 10);
    assert.equal(await meter.locator(".positive").count(), 10);
    assert.equal(await meter.locator(".neutral").count(), 1);
    assert.equal(await meter.locator(".negative.active").count(), negative);
    assert.equal(await meter.locator(".positive.active").count(), positive);
    assert.equal(await meter.locator(".affinity-tick").evaluateAll(ticks => ticks.every(tick => tick.getBoundingClientRect().width === 2)), true);
  }
  assert.deepEqual((await saved()).profile.properties.preferences, []);

  for (const [title, kind] of [["A freely written like", "interest"], ["A personal goal", "want"], ["A value", "value"], ["A boundary", "boundary"]]) {
    await page.getByRole("button", { name: "Add preference", exact: false }).first().click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
    await page.getByLabel("Description", { exact: true }).fill(`Free text for ${title}`);
    await page.getByLabel("Category", { exact: true }).selectOption(kind);
    if (kind === "want" || kind === "boundary") {
      await page.getByRole("slider", { name: "Affinity for context 1" }).evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); }, kind === "want" ? "0" : "-1");
    }
    await page.getByRole("button", { name: "Save preference", exact: true }).click();
    await page.getByText("Preference saved.", { exact: true }).waitFor();
  }
  assert.equal((await saved()).profile.properties.preferences.length, 4);
  await checkGauge("A freely written like", "Identity-wide", 1, 0, 10);
  await checkGauge("A personal goal", "Identity-wide", 0, 0, 0);
  await checkGauge("A boundary", "Identity-wide", -1, 10, 0);
  assert.equal(await rowFor("A freely written like").evaluate(row => row.getBoundingClientRect().height), 60, "Standard rows are denser than the old 84px layout");
  await page.getByRole("button", { name: "Edit A freely written like", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("A freely written dislike");
  await page.getByRole("slider", { name: "Affinity for context 1" }).evaluate(el => { el.value = "-0.7"; el.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.getByRole("button", { name: "Add context" }).click();
  await page.locator('[name="persona"]').nth(1).fill("Work");
  await page.getByRole("slider", { name: "Affinity for context 2" }).evaluate(el => { el.value = "0.4"; el.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.getByRole("button", { name: "Save preference", exact: true }).click();
  await page.getByText("Preference saved.", { exact: true }).waitFor();
  assert.deepEqual((await saved()).profile.properties.preferences[0].personas, [{ persona: "", affinity: -0.7 }, { persona: "Work", affinity: 0.4 }]);
  await checkGauge("A freely written dislike", "Identity-wide", -0.7, 7, 0);
  await checkGauge("A freely written dislike", "Work", 0.4, 0, 4);
  await page.reload();
  await page.getByRole("heading", { name: "My preferences", exact: true }).waitFor();
  await page.getByRole("button", { name: /^Dislikes/ }).click();
  assert.equal(await page.locator(".preference-row").count(), 1);
  await page.locator("#context-filter").selectOption("Work");
  assert.equal(await page.locator(".preference-row").count(), 0, "Work has a positive affinity for this interest");
  await page.getByRole("button", { name: /^Likes/ }).click();
  assert.equal(await page.locator(".preference-row").count(), 1);
  assert.equal(await page.getByRole("meter").count(), 1, "The selected context determines which affinity is shown");
  await checkGauge("A freely written dislike", "Work", 0.4, 0, 4);
  await page.locator("#context-filter").selectOption("all");
  await page.getByRole("button", { name: /^All/ }).click();
  await page.getByRole("searchbox", { name: "Search preferences" }).fill("personal goal");
  assert.equal(await page.locator(".preference-row").count(), 1);
  await page.getByRole("searchbox", { name: "Search preferences" }).fill("");

  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await page.getByLabel("About me", { exact: true }).fill("My own introduction <script>not executable</script>");
  await page.getByLabel("Occupation", { exact: true }).fill("My own information");
  await page.getByRole("button", { name: "Add personal detail" }).click();
  await page.getByRole("textbox", { name: "Label", exact: true }).fill("A custom field");
  await page.getByRole("textbox", { name: "Your information", exact: true }).fill("Anything I want to record");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.getByText("Profile saved.", { exact: true }).waitFor();
  assert.equal(JSON.parse(await readFile(file("identity"), "utf8")).details[0].value, "Anything I want to record");
  await page.reload();
  await page.getByRole("heading", { name: "My preferences", exact: true }).waitFor();
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  assert.equal(await page.getByLabel("About me", { exact: true }).inputValue(), "My own introduction <script>not executable</script>");
  await page.getByLabel("Occupation", { exact: true }).fill("");
  await page.getByRole("button", { name: "Remove personal detail" }).click();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.getByText("Profile saved.", { exact: true }).waitFor();
  assert(!Object.hasOwn((await saved()).profile.identity, "occupation"));
  assert.deepEqual((await saved()).profile.identity.details, []);

  // A second writer changes the repository while the browser has an unsaved draft.
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByRole("button", { name: "Edit A value", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("My retained draft");
  assert.equal(await page.locator(".saved-indicator").innerText(), "Unsaved changes");
  let snapshot = await saved();
  const current = snapshot.profile.properties.preferences.find(p => p.kind === "value");
  const { preference_id, ...value } = current;
  const response = await fetch(`${backend}/api/v1/profiles/${id}/preferences/${preference_id}`, { method: "PUT", headers: { "Content-Type": "application/json", "If-Match": snapshot.revision }, body: JSON.stringify({ ...value, keyword: "Changed elsewhere" }) });
  assert.equal(response.status, 200);
  await page.getByRole("button", { name: "Save preference", exact: true }).click();
  await page.getByRole("button", { name: "Load latest & keep draft" }).waitFor();
  assert.equal(await page.getByLabel("Title", { exact: true }).inputValue(), "My retained draft");
  await page.getByRole("button", { name: "Load latest & keep draft" }).click();
  await page.getByText("Latest information loaded.", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Save preference", exact: true }).click();
  await page.getByText("Preference saved.", { exact: true }).waitFor();
  assert((await saved()).profile.properties.preferences.some(p => p.keyword === "My retained draft"));
  await page.getByRole("button", { name: "Edit My retained draft", exact: true }).click();
  for (const [width, height] of [[1440, 900], [1366, 768], [1280, 720], [1024, 768], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const layout = await page.evaluate(() => {
      const save = document.querySelector('.editor-footer [type="submit"]').getBoundingClientRect();
      const status = document.querySelector('.statusbar').getBoundingClientRect();
      const fields = document.querySelector('.editor-fields');
      return { pageScroll: document.documentElement.scrollHeight > innerHeight + 1, saveVisible: save.top >= 0 && save.bottom <= status.top, fieldsFit: fields.scrollHeight <= fields.clientHeight + 1 };
    });
    assert.equal(layout.pageScroll, false, `No page scrolling at ${width}×${height}`);
    assert.equal(layout.saveVisible, true, `Save stays visible at ${width}×${height}`);
    assert.equal(layout.fieldsFit, true, `The basic preference form fits without scrolling at ${width}×${height}`);
  }
  await page.getByLabel("Description", { exact: true }).fill("This draft survives a failed save.");
  await page.route(`**/api/v1/profiles/${id}/preferences/${preference_id}`, route => route.fulfill({ status: 503, json: { error: "Please try again shortly." } }), { times: 1 });
  await page.getByRole("button", { name: "Save preference", exact: true }).click();
  await page.getByText("Please try again shortly.", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Description", { exact: true }).inputValue(), "This draft survives a failed save.");
  assert.equal((await saved()).profile.properties.preferences.find(p => p.preference_id === preference_id).definition, current.definition);
  await page.getByRole("button", { name: "Save preference", exact: true }).click();
  await page.getByText("Preference saved.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Edit A boundary", exact: true }).click();
  await page.getByRole("button", { name: "Delete preference", exact: true }).click();
  await page.getByRole("button", { name: "Keep it" }).click();
  assert.equal((await saved()).profile.properties.preferences.length, 4);
  await page.getByRole("button", { name: "Delete preference", exact: true }).click();
  await page.getByRole("button", { name: "Delete permanently", exact: true }).click();
  await page.getByText("Preference deleted.", { exact: true }).waitFor();
  assert.equal((await saved()).profile.properties.preferences.length, 3);

  await page.getByRole("button", { name: "Edit My retained draft", exact: true }).click();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Horizontal overflow at ${width}`);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (process.env.QFF_EDITOR_SCREENSHOT) await page.screenshot({ path: process.env.QFF_EDITOR_SCREENSHOT, fullPage: true });
  if (process.env.QFF_EDITOR_SCREENSHOT) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: process.env.QFF_EDITOR_SCREENSHOT.replace(/\.png$/, "-mobile.png"), fullPage: true });
  }
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  for (const width of [1366, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 768 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight + 1), false, `The affinity list fits its viewport at ${width}px`);
    assert.equal(await page.locator(".affinity-tick").evaluateAll(ticks => ticks.every(tick => tick.getBoundingClientRect().width === 2)), true);
  }
  if (process.env.QFF_EDITOR_SCREENSHOT) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: process.env.QFF_EDITOR_SCREENSHOT.replace(/\.png$/, "-mobile-list.png"), fullPage: true });
  }
  assert(!/sample mode|prototype|test profile/i.test(await page.locator("body").innerText()));
  assert.deepEqual(errors, []);
  // Only the profile selector is remembered locally; source data stays on disk.
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), ["qff.identity.selectedProfile"]);

  const longTitle = "A complete preference title covering personal priorities, shared responsibilities, and boundaries across different teams";
  const longContext = "Work and community responsibilities across different teams, projects, and personal commitments";
  const longDescription = "Every part of this description should remain readable in the list, including the reasons behind this preference. ".repeat(4)
    + "\n\nThis second paragraph must retain its line break and remain visible.\n" + "UnbrokenText".repeat(12);
  const longSnapshot = await saved();
  const longResponse = await fetch(`${backend}/api/v1/profiles/${id}/preferences/${preference_id}`, { method: "PUT", headers: { "Content-Type": "application/json", "If-Match": longSnapshot.revision }, body: JSON.stringify({ keyword: longTitle, definition: longDescription, kind: "value", personas: [{ persona: longContext, affinity: 0.6 }] }) });
  assert.equal(longResponse.status, 200);
  await page.goto(frontend);
  await page.getByRole("heading", { name: "My preferences", exact: true }).waitFor();
  async function checkFullText(width, editing) {
    const row = rowFor(longTitle);
    assert.equal(await row.locator(".row-content strong").textContent(), longTitle);
    assert.equal(await row.locator(".row-content>span").textContent(), longDescription);
    assert.equal(await row.locator(".affinity-context").textContent(), longContext);
    const clipped = await row.locator(".row-content strong, .row-content>span, .affinity-context").evaluateAll(elements => elements.flatMap(element => {
      const box = element.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const lines = [...range.getClientRects()].filter(line => line.left < box.left - 1 || line.right > box.right + 1 || line.bottom > box.bottom + 1);
      return element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1 || lines.length
        ? [{ element: element.className || element.tagName, width: [element.scrollWidth, element.clientWidth], height: [element.scrollHeight, element.clientHeight], box: box.toJSON(), lines: lines.map(line => line.toJSON()) }] : [];
    }));
    assert.deepEqual(clipped, [], `Full title, description and context at ${width}px, editor ${editing ? "open" : "closed"}`);
    if (editing) {
      assert.equal(await page.locator('#preference-form textarea').evaluateAll(fields => fields.every(field => field.scrollWidth <= field.clientWidth + 1 && field.scrollHeight <= field.clientHeight + 1)), true, "Editor text fields grow to show the complete text");
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight + 1), false);
  }
  for (const width of [1440, 1366, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await checkFullText(width, false);
    if (width > 900) {
      await rowFor(longTitle).getByRole("button", { name: `Edit ${longTitle}`, exact: true }).click();
      await checkFullText(width, true);
      if (width === 1366 && process.env.QFF_EDITOR_SCREENSHOT) await page.screenshot({ path: process.env.QFF_EDITOR_SCREENSHOT.replace(/\.png$/, "-long-text.png"), fullPage: true });
      await page.getByRole("button", { name: "Close editor", exact: true }).click();
    }
  }

  // Extra records exercise pagination in the disposable repository only.
  let revision = (await saved()).revision;
  await page.setViewportSize({ width: 1366, height: 768 });
  for (let n = 0; n < 198; n++) {
    const response = await fetch(`${backend}/api/v1/profiles/${id}/preferences`, { method: "POST", headers: { "Content-Type": "application/json", "If-Match": revision }, body: JSON.stringify({ keyword: `Pagination check ${n + 1}`, definition: `Temporary browser test record ${n + 1}.`, kind: "interest", personas: [] }) });
    assert.equal(response.status, 201);
    revision = (await response.json()).revision;
    if (n === 96) {
      await page.goto(frontend);
      await page.getByRole("heading", { name: "My preferences", exact: true }).waitFor();
      assert.equal(await page.getByLabel("Preferences per page").inputValue(), "100");
      assert.equal(await page.locator(".preference-row").count(), 100);
      assert.equal(await rowFor("Pagination check 1").getByRole("meter").count(), 0);
      assert.equal(await rowFor("Pagination check 1").locator(".affinity-empty").innerText(), "Not set", "Absent affinity is not presented as neutral");
      assert.equal(await page.locator(".page-navigation").count(), 0, "Exactly 100 items need no pagination by default");
    }
  }
  await page.goto(frontend);
  await page.getByRole("heading", { name: "My preferences", exact: true }).waitFor();
  assert.equal(await page.locator(".preference-row").count(), 100);
  for (const size of [10, 50, 100, 200]) {
    await page.getByLabel("Preferences per page").selectOption(String(size));
    assert.equal(await page.locator(".preference-row").count(), size);
    assert.match(await page.locator(".page-navigation").innerText(), new RegExp(`Page 1 of ${Math.ceil(201 / size)}`));
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1), false);
  }
  await page.getByLabel("Preferences per page").selectOption("50");
  await page.getByRole("button", { name: "Next preferences", exact: true }).click();
  await page.locator(".edit-button").first().click();
  assert.match(await page.locator(".page-navigation").innerText(), /Page 2 of 5/, "Opening an editor keeps the current page");
  await page.setViewportSize({ width: 1024, height: 768 });
  assert.equal(await page.locator(".preference-row").count(), 50);
  assert.match(await page.locator(".page-navigation").innerText(), /Page 2 of 5/, "Resizing does not repaginate the list");
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByLabel("Preferences per page").selectOption("100");
  const seen = [];
  for (let n = 0; n < 20; n++) {
    seen.push(...await page.locator(".edit-button").evaluateAll(buttons => buttons.map(b => b.dataset.edit)));
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1), false);
    const next = page.getByRole("button", { name: "Next preferences", exact: true });
    if (await next.isDisabled()) break;
    await next.click();
  }
  assert.deepEqual(seen.sort(), (await saved()).profile.properties.preferences.map(p => p.preference_id).sort(), "Every record is reachable exactly once through pagination");
  await page.getByRole("searchbox", { name: "Search preferences" }).fill("Pagination check 198");
  assert.equal(await page.locator(".preference-row").count(), 1, "Filtering resets pagination");
  assert.equal(await page.locator(".page-navigation").count(), 0);
  await page.getByRole("searchbox", { name: "Search preferences" }).fill("");
  await checkEditorRegressions(page, backend);
  await page.getByRole("button", { name: "Browser test", exact: true }).click();
  assert.equal(await page.locator(`#profile-select option[value="${id}"]`).textContent(), "Browser test");
  await page.locator("#profile-select").selectOption(id);
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.getByRole("heading", { name: "My preferences", exact: true }).waitFor();
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  assert.equal(await page.evaluate(() => {
    const save = document.querySelector('[form="identity-form"]').getBoundingClientRect();
    return save.top >= 0 && save.bottom <= innerHeight && document.documentElement.scrollHeight <= innerHeight + 1;
  }), true, "Profile save is visible without scrolling");
  await page.getByRole("button", { name: "Delete profile", exact: true }).click();
  await page.getByRole("button", { name: "Delete permanently", exact: true }).click();
  await page.getByText("Your profile has been deleted.", { exact: true }).waitFor();
  assert.equal(await page.locator("#header-page").isVisible(), false, "No stale page title or actions remain after profile deletion");
  assert.deepEqual(await readdir(temp), []);
  await page.addLocatorHandler(page.locator("#confirm-dialog[open]"), async dialog => { await dialog.locator('[value="confirm"]').click(); });
  await checkBuddy(page, backend, buddyProvider);
  assert.deepEqual(errors, []);
  console.log("PASS: Profile CRUD, paging, gauges, responsive layout; Buddy chat → provider → reviewed approval → files, goals, duplicates, refinements, memory, failure recovery, profile isolation and unavailable state. No browser errors.");
} finally {
  await browser?.close();
  for (const child of processes) {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* Already stopped. */ }
  }
  await Promise.all(processes.map(child => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise(resolve => child.once("exit", resolve))));
  await rm(temp, { recursive: true, force: true });
  await buddyProvider?.close();
}
