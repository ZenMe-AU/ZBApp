/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */
// Called by browser-check.mjs against its disposable repository only.
import assert from "node:assert/strict";
import { createServer } from "node:http";

export async function startBuddyProvider() {
  const replies = [], requests = [];
  const server = createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const input = JSON.parse(body.messages[1].content);
      requests.push(input);
      assert.equal(req.url, "/v1/chat/completions");
      const next = replies.shift();
      if (!next) { res.writeHead(500); res.end("No queued test response"); return; }
      const output = await next(input);
      if (output.error) { res.writeHead(503); res.end("Private upstream failure"); return; }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }));
    } catch { res.writeHead(500); res.end("Test provider failed"); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { replies, requests, url: `http://127.0.0.1:${server.address().port}/v1`, close: () => new Promise(resolve => server.close(resolve)) };
}

export async function checkBuddy(page, backend, provider) {
  await page.getByLabel("Your name", { exact: true }).fill("Buddy browser check");
  await page.getByRole("button", { name: "Create my profile" }).click();
  await page.getByText("Your profile is ready.", { exact: false }).waitFor();
  const id = new URL(page.url()).searchParams.get("profile");
  const snapshot = async () => (await (await fetch(`${backend}/api/v1/profiles/${id}`)).json());
  const memory = async () => (await (await fetch(`${backend}/api/v1/profiles/${id}/buddy/memory`)).json());
  const tab = view => page.locator(`[data-buddy-view="${view}"]`);
  const proposal = title => page.locator(".buddy-proposal").filter({ has: page.getByRole("textbox", { name: "Title", exact: true }).and(page.locator(`input[value="${title}"]`)) });
  await page.getByRole("button", { name: "AI Buddy", exact: true }).click();
  await page.getByRole("button", { name: "Send", exact: true }).waitFor();
  assert.equal(provider.requests.length, 0, "Opening Buddy makes no model call");
  assert.equal((await memory()).memory.conversations.length, 0);
  const send = async (message, response) => {
    provider.replies.push(response);
    await page.getByRole("textbox", { name: "Message Buddy", exact: true }).fill(message);
    await page.locator('#buddy-compose [type="submit"]').click();
  };
  const goal = { category: "value", keyword: "Financial independence", definition: "I want to build wealth and become financially independent.", evidence: "I want to become wealthy", reason: "This is an outcome you want to achieve.", affinity: 0.6, context: "", source_preference_id: null };
  await send("I want to become wealthy", () => ({ reply: "What would wealth let you do?", suggestions: [goal] }));
  await page.getByText("What would wealth let you do?", { exact: true }).waitFor();
  assert.equal((await snapshot()).profile.properties.preferences.length, 0);
  await page.reload();
  await page.getByRole("heading", { name: "My preferences", exact: true }).waitFor();
  await page.getByRole("button", { name: "AI Buddy", exact: true }).click();
  await page.getByText("What would wealth let you do?", { exact: true }).waitFor();
  assert.equal(provider.requests.length, 1, "Reloading saved history makes no model call");
  await tab("review").click();
  const card = proposal("Financial independence");
  assert.equal(await card.getByLabel("Category").inputValue(), "goal");
  await card.getByLabel("Description").fill("I want financial independence so I can choose how I spend my time.");
  await card.getByRole("button", { name: "Approve & save", exact: true }).click();
  await page.getByText('Saved “Financial independence” to your preferences.', { exact: true }).waitFor();
  let saved = (await snapshot()).profile.properties.preferences;
  assert.equal(saved.length, 1); assert.equal(saved[0].want_type, "goal");
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  assert.equal(await page.locator(".preference-row .category").innerText(), "Goal");
  await page.getByRole("button", { name: "AI Buddy", exact: true }).click();
  await tab("chat").click();
  await send("I want to become wealthy", input => {
    assert.equal(input.profile.preferences.length, 1); assert.equal(input.messages.length, 3);
    return { reply: "We already have that goal saved. What is your next step?", suggestions: [goal] };
  });
  await page.getByText("We already have that goal saved. What is your next step?", { exact: true }).waitFor();
  assert.equal((await memory()).memory.proposals.filter(p => p.status === "pending").length, 0);

  await tab("diary").click();
  await page.getByLabel("Entry date", { exact: true }).fill("2026-11-23");
  const diaryText = "Today I walked beside the river and loved how quiet it was.";
  const quiet = { ...goal, category: "like", keyword: "Quiet riverside walks", definition: "I enjoy quiet walks beside the river.", evidence: "loved how quiet it was", reason: "Your diary describes enjoying the quiet on your walk." };
  await send(diaryText, input => {
    assert.equal(input.mode, "diary"); assert.equal(input.diary_date, "2026-11-23"); assert.equal(input.diary_focus, "today");
    assert(input.memories.some(m => m.content === "I want to become wealthy"));
    return { reply: "That sounds like a peaceful moment. What did you enjoy most?", suggestions: [quiet] };
  });
  await page.getByText("That sounds like a peaceful moment. What did you enjoy most?", { exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "My preferences", exact: true }).waitFor();
  await page.getByRole("button", { name: "AI Buddy", exact: true }).click();
  await page.getByText(diaryText, { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Entry date", { exact: true }).inputValue(), "2026-11-23");
  assert.equal((await snapshot()).profile.properties.preferences.length, 1, "Diary recommendations wait for later approval");
  await page.getByRole("button", { name: "New diary entry", exact: true }).click();
  await page.getByLabel("Entry date", { exact: true }).fill("2026-11-24");
  await page.getByLabel("Writing about", { exact: true }).selectOption("future");
  const hope = "I hope to become fluent in Spanish.";
  await send(hope, input => {
    assert.equal(input.diary_focus, "future"); assert(input.memories.some(m => m.content === diaryText));
    return { reply: "What would speaking Spanish make possible for you?", suggestions: [{ ...goal, category: "goal", keyword: "Learn Spanish", definition: "I aim to become fluent in Spanish.", evidence: hope }] };
  });
  await page.getByText("What would speaking Spanish make possible for you?", { exact: true }).waitFor();
  for (const width of [1366, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const view of ["diary", "review", "archive", "history"]) {
      await tab(view).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight + 1), false, `${view} fits at ${width}px`);
      if ((width === 1366 || width === 390) && process.env.QFF_EDITOR_SCREENSHOT) {
        await page.waitForTimeout(100);
        await page.screenshot({ path: process.env.QFF_EDITOR_SCREENSHOT.replace(/\.png$/, `-buddy-${view}-${width}.png`) });
      }
    }
  }
  await page.setViewportSize({ width: 1366, height: 844 });
  await tab("review").click();
  await proposal("Quiet riverside walks").getByRole("button", { name: "Approve & save", exact: true }).click();
  await page.getByText('Saved “Quiet riverside walks” to your preferences.', { exact: true }).waitFor();
  const spanish = proposal("Learn Spanish");
  await spanish.getByRole("button", { name: "Approve & save", exact: true }).click();
  await spanish.locator(".buddy-error").waitFor();
  assert.equal(await spanish.getByRole("button", { name: "Approve & save", exact: true }).isDisabled(), true);
  await spanish.getByRole("button", { name: "Review latest", exact: true }).click();
  await page.getByText("Latest profile loaded.", { exact: false }).waitFor();
  await spanish.getByRole("button", { name: "Approve & save", exact: true }).click();
  await page.getByText('Saved “Learn Spanish” to your preferences.', { exact: true }).waitFor();
  saved = (await snapshot()).profile.properties.preferences;
  assert.equal(saved.length, 3); assert.equal(saved.find(p => p.keyword === "Learn Spanish").want_type, "goal");

  await tab("chat").click();
  await send("I also want a financial independence plan", () => ({ reply: "That sounds related to your existing goal. Check whether you want a separate entry.", suggestions: [{ ...goal, category: "want", keyword: "Financial independence plan", definition: "I want a written plan for financial independence.", evidence: "I also want a financial independence plan" }] }));
  await page.getByText("That sounds related to your existing goal.", { exact: false }).waitFor();
  await tab("review").click();
  const similar = proposal("Financial independence plan");
  assert.equal(await similar.getByRole("button", { name: "Approve & save", exact: true }).isDisabled(), true);
  await similar.getByRole("checkbox").check();
  assert.equal(await similar.getByRole("button", { name: "Approve & save", exact: true }).isEnabled(), true);
  await similar.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByText("Recommendation archived.", { exact: false }).waitFor();
  const archived = (await memory()).memory.proposals.find(p => p.preference.keyword === "Financial independence plan");
  assert.equal(archived.status, "archived"); assert.match(archived.archived_at, /^\d{4}-\d{2}-\d{2}T/);
  await tab("archive").click();
  const archivedRow = page.locator(".buddy-archive-table tbody tr").filter({ hasText: "Financial independence plan" });
  await archivedRow.waitFor(); assert.equal(await archivedRow.getByText("I want a written plan for financial independence.", { exact: true }).count(), 1);
  await page.getByRole("searchbox", { name: "Search archive", exact: true }).fill("no such recommendation");
  await page.getByText("No matching recommendations", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page.locator(".buddy-archive-table tbody tr").filter({ hasText: "Financial independence plan" }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "My preferences", exact: true }).waitFor();
  await page.getByRole("button", { name: "AI Buddy", exact: true }).click();
  await tab("archive").click();
  await page.locator(".buddy-archive-table tbody tr").filter({ hasText: "Financial independence plan" }).waitFor();
  await tab("chat").click();
  await send("By independence I mean more freedom with my time", input => {
    assert(input.decisions.some(d => d.startsWith("archived: Financial independence plan")));
    return { reply: "That helps clarify your goal.", suggestions: [{ ...goal, category: "goal", evidence: "more freedom with my time", definition: "I want financial independence to have more freedom with my time.", source_preference_id: input.profile.preferences.find(p => p.keyword === "Financial independence").preference_id }] };
  });
  await page.getByText("That helps clarify your goal.", { exact: true }).waitFor();
  await tab("review").click();
  await card.getByRole("button", { name: "Approve & save", exact: true }).click();
  await page.getByText('Saved “Financial independence” to your preferences.', { exact: true }).waitFor();
  saved = (await snapshot()).profile.properties.preferences;
  assert.equal(saved.length, 4); assert.equal(saved[0].superseded_by, saved[3].preference_id);
  await tab("history").click();
  const diaryRow = page.locator(".buddy-history-row").filter({ hasText: diaryText });
  await diaryRow.getByRole("button", { name: /^Delete / }).click();
  await page.getByText("Saved conversation deleted.", { exact: false }).waitFor();
  assert.equal((await snapshot()).profile.properties.preferences.length, 4, "Deleting a diary keeps its approved preference");
  assert.equal((await memory()).memory.conversations.some(c => c.turns.some(t => t.content === diaryText)), false);
  await tab("chat").click();
  await send("Let's continue", () => ({ error: true }));
  await page.locator(".buddy-turn-status").waitFor();
  assert.equal((await memory()).memory.conversations.find(c => c.mode === "chat").turns.at(-1).content, "Let's continue");
  provider.replies.push(() => ({ reply: "Sure. What would you like to explore?", suggestions: [] }));
  await page.getByRole("button", { name: "Try Buddy again", exact: true }).click();
  await page.getByText("Sure. What would you like to explore?", { exact: true }).waitFor();
  assert.equal((await memory()).memory.conversations.flatMap(c => c.turns).filter(t => t.content === "Let's continue").length, 1);

  const create = await fetch(`${backend}/api/v1/profiles`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ external_id: "BUDDY_OTHER", identity: { name: "Other buddy check" }, properties: { preferences: [] }, relations: { relations: [] } }) });
  assert.equal(create.status, 201);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await send("A delayed reply", async () => { await gate; return { reply: "This belongs only to the first profile.", suggestions: [] }; });
  await page.locator(".buddy-thinking").waitFor();
  await page.locator('[data-action="open-profiles"]').click();
  await page.locator("#profile-select").selectOption("BUDDY_OTHER");
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await page.locator('.buddy-workspace .buddy-empty').waitFor();
  const returned = page.waitForResponse(response => response.url().endsWith(`/${id}/buddy/messages`));
  release(); await returned;
  assert.equal(await page.locator(".buddy-message").count(), 0);
  await page.route("**/api/v1/ai-assistance", route => route.fulfill({ json: { available: false, reason: "Buddy is not connected yet." } }));
  await page.reload();
  await page.getByRole("heading", { name: "My preferences", exact: true }).waitFor();
  await page.getByRole("button", { name: "AI Buddy", exact: true }).click();
  await page.getByText("Buddy is not connected yet.", { exact: false }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Send", exact: true }).isDisabled(), true);
  await tab("diary").click();
  await page.getByRole("textbox", { name: "Message Buddy", exact: true }).fill("An unsent diary entry");
  assert.equal(await page.getByRole("button", { name: "Save entry", exact: true }).isEnabled(), true);
  await page.unroute("**/api/v1/ai-assistance");
  assert.equal(provider.replies.length, 0);
  await checkChatExperience(page, backend, provider);
}


async function checkChatExperience(page, backend, provider) {
  const id = new URL(page.url()).searchParams.get("profile");
  const memory = async () => (await (await fetch(`${backend}/api/v1/profiles/${id}/buddy/memory`)).json()).memory;
  const input = page.getByRole("textbox", { name: "Message Buddy", exact: true });
  const open = async () => {
    await page.reload();
    await page.getByRole("button", { name: "AI Buddy", exact: true }).click();
    await page.locator('[data-buddy-view="chat"]').click();
    await page.waitForFunction(() => !document.querySelector('#buddy-compose textarea')?.readOnly);
  };
  const screenshot = async name => {
    if (process.env.QFF_EDITOR_SCREENSHOT) await page.screenshot({ path: process.env.QFF_EDITOR_SCREENSHOT.replace(/\.png$/, `-chat-${name}.png`) });
  };
  const layout = () => page.evaluate(() => Object.fromEntries(
    ['.buddy-message-area', '.buddy-compose', '#buddy-compose textarea', '.buddy-send'].map(selector => {
      const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
      return [selector, { x, y, width, height }];
    })
  ));
  const unchanged = async (expected, state) => {
    const actual = await layout();
    for (const selector of Object.keys(expected)) for (const dimension of ['x', 'y', 'width', 'height']) {
      assert(Math.abs(actual[selector][dimension] - expected[selector][dimension]) < 1,
        `${state}: ${selector} ${dimension} stays at ${expected[selector][dimension]}, got ${actual[selector][dimension]}`);
    }
    assert.equal(await page.locator('.buddy-send').innerText(), 'Send', 'Sending does not change the button label');
    assert.equal(await page.locator('.buddy-conversation .buddy-notice').count(), 0);
    assert.equal(await page.locator('.buddy-composer-shell [role="status"]').count(), 0);
  };
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open();
  const emptyLayout = await layout();
  const before = provider.requests.length;
  await input.fill("한글 입력"); await input.press("Shift+Enter");
  assert.equal(await input.inputValue(), "한글 입력\n");
  await input.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await input.dispatchEvent("keydown", { key: "Enter", keyCode: 229 });
  assert.equal(provider.requests.length, before);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const reply = "That sounds like a welcome pause in a busy day. Having a little space to yourself can help you notice what you enjoy, without needing to turn every moment into a goal. What made that moment feel different from the rest of your day?";
  provider.replies.push(async () => { await gate; return { reply, suggestions: [{ category: 'like', keyword: 'Quiet time after work', definition: 'I enjoy a quiet moment after work.', evidence: 'I enjoyed a quiet moment after work today.', reason: 'You described enjoying a quiet moment.', affinity: 0.6, context: '', source_preference_id: null }] }; });
  await input.fill("I enjoyed a quiet moment after work today.\nA little room to relax.\nA pause in a busy day.");
  await unchanged(emptyLayout, 'Multiline draft');
  await input.press("Enter");
  await page.locator(".buddy-thinking").waitFor();
  await unchanged(emptyLayout, 'First message sending');
  assert.equal(await page.locator(".buddy-message.user").filter({ hasText: "I enjoyed a quiet moment" }).count(), 1, "The sent message appears before the AI reply");
  assert.equal(await input.inputValue(), "");
  await input.fill("Keep this next draft"); await input.press("Enter");
  const pendingLayouts = [];
  for (const [width, height] of [[1440, 900], [390, 844], [390, 600], [320, 568]]) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(100);
    pendingLayouts.push({ width, height, geometry: await layout() });
    const geometry = await page.evaluate(() => {
      const message = document.querySelector('.buddy-message-area').getBoundingClientRect();
      const compose = document.querySelector('.buddy-compose').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight + 1,
        messages: message.height, composeBottom: compose.bottom, viewport: innerHeight };
    });
    assert.equal(geometry.overflow, false); assert(geometry.messages >= 170, `Readable chat area at ${width}x${height}`);
    assert(geometry.composeBottom <= geometry.viewport - 34);
    await screenshot(`waiting-${width}-${height}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await input.dispatchEvent("compositionstart");
  const composing = await input.elementHandle();
  const returned = page.waitForResponse(response => response.url().endsWith(`/${id}/buddy/messages`));
  release(); await returned; await page.waitForTimeout(100);
  assert(await composing.evaluate(el => el.isConnected && el.dataset.composing === "true"), "An arriving reply does not replace the active IME input");
  await input.dispatchEvent("compositionend");
  const reveal = page.locator('[data-buddy-reveal]');
  await reveal.waitFor();
  assert((await reveal.innerText()).length < reply.length, "A new reply is revealed progressively");
  assert.equal(await input.inputValue(), "Keep this next draft");
  await page.getByRole("button", { name: "Show full reply", exact: true }).click();
  await unchanged(emptyLayout, 'Reply completed with a recommendation');
  assert.equal(await page.locator('.buddy-reply').last().innerText(), reply);
  assert.equal(provider.requests.length, before + 1, "Animation and double Enter do not make extra model calls");
  assert.equal(await page.locator('.buddy-message.user').count(), 1, "The optimistic turn is replaced without duplication");
  assert.equal((await memory()).proposals.filter(p => p.status === 'pending').length, 1);
  assert.equal(await page.locator('.buddy-feedback').count(), 0, 'Saving and recommendations do not insert a success banner');
  for (const { width, height, geometry } of pendingLayouts) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(100);
    await unchanged(geometry, `Completed reply at ${width}x${height}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await screenshot("conversation-desktop");
  const conversation = (await memory()).conversations[0];
  // Long history belongs to the disposable test profile, never a real profile.
  for (let n = 0; n < 12; n++) {
    provider.replies.push(() => ({ reply, suggestions: [] }));
    const response = await fetch(`${backend}/api/v1/profiles/${id}/buddy/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_id: crypto.randomUUID(), conversation_id: conversation.conversation_id, mode: "chat", message: `Conversation layout check ${n}. ${"A reflection from the day. ".repeat(6)}` }) });
    assert.equal(response.status, 200);
  }
  await open();
  let finish;
  const waiting = new Promise(resolve => { finish = resolve; });
  provider.replies.push(async () => { await waiting; return { reply, suggestions: [] }; });
  await input.fill("A new reply while I read earlier messages"); await input.press("Enter");
  await page.locator('.buddy-thinking').waitFor();
  const log = page.locator('.buddy-messages');
  await log.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });
  await page.getByRole('button', { name: 'Jump to latest message' }).waitFor();
  finish();
  await reveal.waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-buddy-reveal]'));
  assert.equal(await log.evaluate(el => el.scrollTop), 0, "Incoming text does not pull readers away from earlier messages");
  await page.getByRole('button', { name: 'Jump to latest message' }).click();
  assert(await log.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop < 2));
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(100);
  assert(await log.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop < 2), "Resizing keeps the latest message visible when already following it");
  await screenshot("conversation-mobile");
  await page.emulateMedia({ reducedMotion: 'reduce' });
  provider.replies.push(() => ({ reply: "A complete reply with reduced motion.", suggestions: [] }));
  await input.fill("Reduced motion check"); await input.press("Enter");
  await page.getByText("A complete reply with reduced motion.", { exact: true }).waitFor();
  assert.equal(await reveal.count(), 0, "Reduced motion skips the text animation");
  const beforeError = await layout();
  await page.route('**/buddy/messages', route => route.fulfill({ status: 503, json: { error: 'Temporary connection failure' } }), { times: 1 });
  await input.fill("Retain this message if delivery fails"); await input.press("Enter");
  await page.getByRole('alert').filter({ hasText: 'Temporary connection failure' }).waitFor();
  await unchanged(beforeError, 'Connection error');
  assert.equal(await page.locator('.buddy-message.user').filter({ hasText: 'Retain this message if delivery fails' }).count(), 1);
  await input.fill("My next unsent draft");
  provider.replies.push(() => ({ reply: "Your retry arrived once.", suggestions: [] }));
  await page.getByRole('button', { name: 'Try Buddy again', exact: true }).click();
  await page.getByText('Your retry arrived once.', { exact: true }).waitFor();
  await unchanged(beforeError, 'Retry completed');
  assert.equal(await input.inputValue(), "My next unsent draft");
  assert.equal((await memory()).conversations.flatMap(c => c.turns).filter(t => t.content === "Retain this message if delivery fails").length, 1);
  provider.replies.push(() => ({ reply: "Saved before the response was lost.", suggestions: [] }));
  await page.route('**/buddy/messages', async route => {
    await route.fetch();
    await route.fulfill({ status: 503, json: { error: 'Response lost after saving' } });
  }, { times: 1 });
  await input.fill("Reconcile a saved message"); await input.press("Enter");
  await page.getByRole('alert').filter({ hasText: 'Response lost after saving' }).waitFor();
  await input.fill("Preserve this draft during reload");
  const calls = provider.requests.length;
  await page.getByRole('button', { name: 'Reload memory', exact: true }).click();
  await page.getByText('Saved before the response was lost.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Send', exact: true }).isEnabled(), true);
  assert.equal(await input.inputValue(), "Preserve this draft during reload");
  assert.equal(provider.requests.length, calls, "Memory reload recovers delivery without another model call");
  assert.equal(provider.replies.length, 0);
}
