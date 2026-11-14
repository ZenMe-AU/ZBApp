/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

test("Preferences Edit selects identities and saves persona preferences", { timeout: 120_000 }, async () => {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
  });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer?.address();
    assert.ok(address && typeof address !== "string");
    const files: { path: string, content: unknown }[] = [];
    for (const [id, name] of [["a", "Alice"], ["b", "Bob"]]) {
      files.push(
        { path: `${id}/${id}-identity.json`, content: { identity_id: id, name } },
        { path: `${id}/${id}-personas.json`, content: { identity_id: id, personas: [{ persona: "Friends" }, { persona: "Colleagues" }] } },
        { path: `${id}/${id}-properties.json`, content: {
          identity_id: id, embedding_model: { name: "test", version: "1", dimensions: 16 },
          preferences: [{ keyword: "Music", definition: "Listening to music", kind: "interest", personas: [{ persona: "Friends", affinity: 0.5 }], embedding: [1, ...Array(15).fill(0)] }],
        } },
        { path: `${id}/${id}-relations.json`, content: { identity_id: id, relations: [] } },
      );
    }
    let refreshRequests = 0;
    let refreshFails = true;
    browser = await chromium.launch();
    const page = await browser.newPage();
    page.on("dialog", dialog => dialog.accept());
    await page.route("**/api/modes", route => route.fulfill({ json: {
      revision: "test",
      data: { embedding_model: { name: "test", version: "1", dimensions: 16 }, modes: {} },
    } }));
    await page.route("**/api/files*", async (route) => {
      if (route.request().method() === "PUT") {
        const path = new URL(route.request().url()).searchParams.get("path");
        const file = files.find(item => item.path === path);
        assert.ok(file);
        file.content = route.request().postDataJSON();
        await route.fulfill({ json: { ok: true } });
      }
      else await route.fulfill({ json: files });
    });
    await page.route("**/api/embeddings", async (route) => {
      if (route.request().method() === "POST") {
        assert.equal(route.request().postDataJSON().dimensions, 16);
        refreshRequests++;
        await route.fulfill({ json: { status: "running" } });
      }
      else await route.fulfill({ json: refreshFails
        ? { status: "failed", log: ["Refresh failed"] }
        : { status: "succeeded", log: ["Done"] } });
    });
    await page.goto(`http://127.0.0.1:${address.port}/#preferences-edit`);
    const root = page.locator("#page");
    await root.getByRole("heading", { name: "Preferences: Edit" }).waitFor();
    assert.equal(await page.locator("#menu a[data-id=\"preferences-edit\"]").count(), 1);
    const identity = root.getByLabel("Identity", { exact: true });
    assert.equal(await identity.inputValue(), "Alice");
    const headingBox = await root.locator("h2").boundingBox();
    const identityBox = await identity.boundingBox();
    assert.ok(headingBox && identityBox && identityBox.x > headingBox.x && Math.abs(identityBox.y - headingBox.y) < 10);
    const friends = root.locator("details").filter({ hasText: "Friends" });
    await friends.locator("summary").click();
    await friends.getByLabel("Friends preference 1 definition").fill("Playing music");
    assert.equal(await friends.locator(".embedding-status").innerText(), "Needs embedding");
    assert.equal(await root.locator(".refresh").isDisabled(), true);
    assert.equal(await page.locator("#save").isEnabled(), true);
    await friends.getByLabel("Friends preference 1 definition").fill("");
    await friends.getByLabel("Friends preference 1 definition").dispatchEvent("change");
    assert.equal(await friends.getByLabel("Friends preference 1 definition").inputValue(), "Playing music");
    assert.match(await root.locator(".message").innerText(), /Definition cannot be empty/);
    const affinity = friends.getByLabel("Friends preference 1 affinity");
    await affinity.fill("-1.1");
    await affinity.dispatchEvent("change");
    assert.equal(await affinity.inputValue(), "0.5");
    assert.match(await root.locator(".message").innerText(), /between -1 and 1/);
    await affinity.fill("-0.4");
    await affinity.dispatchEvent("change");
    await friends.getByLabel("Friends preference 1 kind").selectOption("value");
    await identity.fill("not an identity");
    assert.match(await root.locator(".message").innerText(), /Select an identity/);
    assert.equal(await root.locator("details").count(), 0);
    await identity.fill("Bob");
    assert.equal(await root.locator("details").filter({ hasText: "Friends" }).locator("summary").innerText(), "Friends · 1 preference");
    await identity.fill("Alice");
    await root.locator("details").filter({ hasText: "Friends" }).locator("summary").click();
    assert.equal(await root.getByLabel("Friends preference 1 definition").inputValue(), "Playing music");
    assert.equal(await root.getByLabel("Friends preference 1 affinity").inputValue(), "-0.4");
    const colleagues = root.locator("details").filter({ hasText: "Colleagues" });
    await colleagues.locator("summary").click();
    await colleagues.getByRole("button", { name: "Add preference" }).click();
    assert.match(await root.locator(".message").innerText(), /Enter a keyword and definition/);
    await colleagues.getByLabel("New Colleagues preference keyword").fill("Chess");
    await colleagues.getByLabel("New Colleagues preference definition").fill("A board game");
    await colleagues.getByRole("button", { name: "Add preference" }).click();
    assert.equal(await root.getByLabel("Colleagues preference 1 keyword").inputValue(), "Chess");
    await colleagues.getByLabel("Existing preference for Colleagues").selectOption("0");
    await colleagues.getByRole("button", { name: "Add to persona" }).click();
    assert.equal(await root.getByLabel("Colleagues preference 1 keyword").inputValue(), "Music");
    assert.equal(await root.getByLabel("Colleagues preference 1 affinity").inputValue(), "0.5");
    await root.getByLabel("Colleagues preference 1 affinity").fill("0.8");
    await root.getByLabel("Colleagues preference 1 affinity").dispatchEvent("change");
    assert.equal(await root.getByLabel("Friends preference 1 affinity").inputValue(), "-0.4");
    await root.getByLabel("Friends preference 1 definition").fill("Shared meaning");
    assert.equal(await root.getByLabel("Colleagues preference 1 definition").inputValue(), "Shared meaning");
    await page.locator("#save").click();
    await page.waitForFunction(() => document.querySelector("#status")?.textContent === "All changes saved");
    const saved = files.find(file => file.path === "a/a-properties.json")?.content as {
      preferences: { definition: string, kind: string, personas: { persona: string, affinity: number }[], embedding: number[] | null }[]
    };
    assert.equal(saved.preferences[0].embedding, null);
    assert.deepEqual(saved.preferences[0].personas, [{ persona: "Friends", affinity: -0.4 }, { persona: "Colleagues", affinity: 0.8 }]);
    assert.equal(saved.preferences[0].kind, "value");
    assert.equal(saved.preferences[0].definition, "Shared meaning");
    assert.equal(saved.preferences[1].definition, "A board game");
    await root.locator(".refresh").click();
    await root.getByText("Refresh failed", { exact: true }).waitFor();
    assert.equal(await root.locator(".refresh").isEnabled(), true);
    refreshFails = false;
    await root.locator(".refresh").click();
    await page.waitForFunction(() => document.querySelector("#page .identity-search") instanceof HTMLInputElement
      && (document.querySelector("#page .identity-search") as HTMLInputElement).value === "Alice"
      && !(document.querySelector<HTMLButtonElement>("#page .refresh")?.disabled));
    assert.equal(refreshRequests, 2);
    await page.locator("#menu a[data-id=\"modes-edit\"]").click();
    await root.getByRole("heading", { name: "Modes: Edit" }).waitFor();
    await root.locator(".refresh").click();
    await page.waitForFunction(() => !(document.querySelector<HTMLButtonElement>("#page .refresh")?.disabled));
    assert.equal(refreshRequests, 3);
    await page.locator("#menu a[data-id=\"preferences-edit\"]").click();
    await root.getByRole("heading", { name: "Preferences: Edit" }).waitFor();
    const savedColleagues = root.locator("details").filter({ hasText: "Colleagues" });
    await savedColleagues.locator("summary").click();
    await savedColleagues.getByRole("button", { name: "Delete" }).first().click();
    assert.match(await savedColleagues.locator("summary").innerText(), /1 preference/);
    await root.locator("details").filter({ hasText: "Friends" }).locator("summary").click();
    assert.equal(await root.getByLabel("Friends preference 1 definition").inputValue(), "Shared meaning");
    await savedColleagues.getByRole("button", { name: "Delete" }).click();
    assert.match(await savedColleagues.locator("summary").innerText(), /0 preferences/);
    assert.equal(await page.locator("#save").isEnabled(), true);
  }
  finally {
    await browser?.close();
    await server.close();
  }
});
