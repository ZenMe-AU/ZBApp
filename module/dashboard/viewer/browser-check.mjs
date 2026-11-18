/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

// Start Dashboard first. All API requests below use fixtures; no user data or LLM is touched.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const base = process.env.DASHBOARD_URL ?? "http://127.0.0.1:4178";
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    const run = "2026-11-18T09-30-00_Mike-Bella-Ian.chat.md";
    const olderRun = "2026-11-17T09-30-00_Bella.chat.md";
    let delaySelectedRun = false;
    let delayedRunStarted = false;
    const refereeScopes = [];
    let longReply = false;
    const events = [
      {
        id: "start",
        runId: run,
        eventType: "run.started",
        kind: "start",
        occurredAt: "2026-11-18T09:30:00Z",
        eventData: { participants: ["Mike", "Bella", "Ian", "Josh"] },
      },
      { id: "end", runId: run, eventType: "run.completed", kind: "system", occurredAt: "2026-11-18T09:31:00Z", eventData: { report: "complete" } },
    ];
    let slow = false,
      active = 0,
      max = 0,
      polls = 0,
      questionCalls = 0;
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      let data = {};
      if (url.pathname === "/api/run") {
        active++;
        polls++;
        max = Math.max(max, active);
        if (slow) await new Promise(r => setTimeout(r, 2200));
        await route.fulfill({ json: { status: "idle" } });
        active--;
        return;
      }
      if (url.pathname === "/api/runs") data = { runs: [{ name: run, mtime: 2, completed: true }, { name: olderRun, mtime: 1, completed: false }] };
      if (url.pathname === "/api/activity") {
        data = url.searchParams.get("scope") === "all" ? { mtime: 1, runs: [{ runId: run, events, legacyText: "" }] } : { run, mtime: 1, events };
        if (url.searchParams.get("run") === olderRun) data = { run: olderRun, mtime: 1, events: [{ ...events[0], eventData: { participants: ["Bella"] } }] };
        if (delaySelectedRun && url.searchParams.get("run") === run) {
          delayedRunStarted = true;
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      if (url.pathname === "/api/report") data = { text: "" };
      if (url.pathname === "/api/network") data = { networks: {} };
      if (url.pathname === "/api/agents") data = { oids: { Mike: "external-mike" } };
      if (url.pathname === "/api/questions") {
        questionCalls++;
        if (questionCalls === 1) {
          await route.fulfill({ status: 503, json: { error: "temporary unavailable" } });
          return;
        }
        data = {
          questions: [{ id: "q1", title: "Recovered question", questionText: "Recovery visible?", optionList: ["Yes", "No"], profileId: "external-mike" }],
        };
      }
      if (url.pathname === "/api/answers") data = { answers: [], activity: [] };
      if (url.pathname === "/api/chat" || url.pathname === "/api/referee-chat")
        data = { answer: longReply ? "Long reply line\n".repeat(100) : "Verified response", evidence: { scope: "run", activity: [], api: [{ actor: "Ian", path: "/questions", data: [{ id: "evidence-question", title: "Evidence snapshot" }] }] } };
      if (url.pathname === "/api/referee-chat") refereeScopes.push(route.request().postDataJSON().scope);
      if (url.pathname === "/api/chat" || url.pathname === "/api/referee-chat") await new Promise(resolve => setTimeout(resolve, 700));
      await route.fulfill({ json: data });
    });
    await page.goto(base);
    await page.locator("#run-title").filter({ hasText: "Nov 18, 09:30" }).waitFor();
    assert.equal(await page.locator("#human-profile").count(), 0);
    assert.equal(await page.locator(".run-head").count(), 0);
    assert.equal(await page.locator("[data-count=\"participants\"]").innerText(), "4");
    const bounds = await page.evaluate(() =>
      [".brand", "#run-title", ".metrics"].map((s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        return { x: r.x, right: r.right, y: r.y };
      }),
    );
    assert(bounds[0].right <= bounds[1].x && bounds[1].right <= bounds[2].x);
    await page.getByRole("button", { name: "Mike, Agent", exact: true }).click();
    await page.getByText("Questions for Mike could not be loaded.", { exact: true }).waitFor();
    await page.getByText("Recovery visible?", { exact: true }).first().waitFor({ timeout: 8000 });
    console.log("PASS header relocation, Human button removal, retained human participant data, question error recovery");
    for (const view of ["chat", "referee-chat"]) {
      await page.emulateMedia({ reducedMotion: view === "referee-chat" ? "reduce" : "no-preference" });
      await page.locator(`[data-view="${view}"]`).click();
      assert.equal(await page.locator("#chat-run-select optgroup[label=Completed] option").count(), 1);
      assert.equal(await page.locator("#chat-run-select optgroup[label=Incomplete] option").count(), 1);
      if (view === "chat") {
        assert.equal(await page.locator("#chat-run-select option[value=__all__]").count(), 0);
        await page.locator("#chat-run-select").selectOption(olderRun);
        await page.locator("#run-title").filter({ hasText: "Nov 17, 09:30" }).waitFor();
        await page.locator("#chat-run-select").selectOption(run);
      }
      else {
        await page.locator("#chat-run-select").selectOption("__all__");
      }
      await page.locator("#chat-input").fill("Check this run");
      await page.locator("#chat-send").click();
      await page.locator(".thinking-dots").waitFor();
      assert.equal(await page.locator(".thinking-dots span").count(), 3);
      assert.equal(await page.locator(".thinking-dots span").first().evaluate(element => getComputedStyle(element).animationName), view === "referee-chat" ? "none" : "thinking-wave");
      await page.getByRole("button", { name: "Verified response", exact: true }).waitFor();
    }
    await page.getByRole("button", { name: "Verified response", exact: true }).click();
    assert((await page.locator("#event-text").innerText()).includes("Verified response"));
    assert.deepEqual(await page.locator("#event-text h3").allTextContents(), ["Answer", "Scope", "API", "Other evidence"]);
    await page.locator("#event-text summary").filter({ hasText: "API · Ian: /questions" }).click();
    assert((await page.locator("#event-text").innerText()).includes("Evidence snapshot"));
    await page.locator("#referee-evidence summary").click();
    await page.getByRole("button", { name: "Ian: /questions", exact: true }).click();
    assert((await page.locator("#event-text").innerText()).includes("Evidence snapshot"));
    assert.deepEqual(refereeScopes, ["all-runs"]);
    await page.locator("#chat-run-select").selectOption(run);
    await page.locator("#chat-input").fill("Check only this run");
    await page.locator("#chat-send").click();
    await page.getByRole("button", { name: "Verified response", exact: true }).waitFor();
    assert.deepEqual(refereeScopes, ["all-runs", "selected-run"]);
    await page.locator("[data-view=\"activity\"]").click();
    await page.locator("#activity-grid .ag-root").waitFor();
    await page.locator("[data-view=\"questions\"]").click();
    for (const width of [1280, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(100);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, `overflow at ${width}`);
      if (width <= 650) assert(await page.locator("#view-tabs").evaluate(element => element.scrollWidth <= element.clientWidth));
    }
    delaySelectedRun = true;
    for (let attempt = 0; !delayedRunStarted && attempt < 50; attempt++) await page.waitForTimeout(100);
    assert(delayedRunStarted, "selected run refresh did not start");
    await page.locator(`[data-run="${olderRun}"]`).evaluate(element => element.click());
    await page.locator("#run-title").filter({ hasText: "Nov 17, 09:30" }).waitFor();
    await page.waitForTimeout(2300);
    assert.equal(await page.locator("[data-count=\"participants\"]").innerText(), "1", "old responses must not overwrite the selected run");
    delaySelectedRun = false;
    longReply = true;
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 });
      for (const view of ["chat", "referee-chat"]) {
        await page.locator(`[data-view="${view}"]`).click();
        await page.locator("#chat-input").fill("Long response check");
        await page.locator("#chat-send").click();
        await page.waitForFunction(() => document.querySelector("#chat-messages").textContent.includes("Long reply line") && !document.querySelector("#chat-send").disabled);
        await page.waitForFunction(() => {
          const element = document.querySelector("#chat-messages");
          return element.scrollHeight - element.clientHeight - element.scrollTop < 2;
        });
        await page.locator("#chat-messages").evaluate((element) => { element.scrollTop = 0; });
        await page.locator("#chat-panel").evaluate(element => element.scrollIntoView({ block: "end" }));
        await page.locator("#chat-messages").hover();
        const positions = () => page.evaluate(() => [scrollY, ...[".topbar", "#view-tabs", "#chat-run-select", "#chat-form"].map(selector => document.querySelector(selector).getBoundingClientRect().top)]);
        const beforeScroll = await positions();
        assert(await page.locator("#chat-form").evaluate(element => element.getBoundingClientRect().top >= document.querySelector("#chat-messages").getBoundingClientRect().bottom), "input belongs below messages");
        if (width > 900) {
          assert(await page.locator(".workspace").evaluate(element => {
            const gap = innerHeight - element.getBoundingClientRect().bottom;
            return gap >= 0 && gap <= 16;
          }), "chat must fill the remaining viewport without a large bottom gap");
        }
        assert(await page.locator("#chat-form").evaluate((element) => {
          const box = element.getBoundingClientRect();
          return box.top >= document.querySelector(".topbar").getBoundingClientRect().bottom && box.bottom <= innerHeight;
        }), "message input must stay visible below the scrolling conversation");
        await page.mouse.wheel(0, 700);
        await page.waitForTimeout(200);
        assert(await page.locator("#chat-messages").evaluate(element => element.scrollTop > 0));
        assert.deepEqual(await positions(), beforeScroll, "scrolling messages must not move chat controls or the page");
      }
    }
    console.log("PASS long Chat and Referee messages scroll independently on desktop and mobile");
    slow = true;
    max = 0;
    const before = polls;
    await page.waitForTimeout(7500);
    assert(polls > before + 1);
    assert.equal(max, 1);
    assert.deepEqual(errors, []);
    console.log("PASS chat/referee responses, Activity rendering, 320-1280px layouts, slow polling max concurrency=1, no browser errors");
  }
  finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
