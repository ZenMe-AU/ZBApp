/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

test("preference views support a shared preference with persona-specific affinities", { timeout: 120_000 }, async () => {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)), logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
  });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer?.address();
    assert.ok(address && typeof address !== "string");
    const vector = [1, ...Array(15).fill(0)];
    const files: { path: string, content: unknown }[] = [];
    for (const [id, name] of [["a", "Alice"], ["b", "Bob"]]) {
      files.push(
        { path: `${id}/${id}-identity.json`, content: { identity_id: id, name } },
        { path: `${id}/${id}-test-context.json`, content: { identity_id: id, personas: [{ persona: "Friends" }, { persona: "Work" }] } },
        { path: `${id}/${id}-properties.json`, content: {
          identity_id: id, embedding_model: { name: "test", version: "1", dimensions: 16 },
          preferences: [{
            keyword: "Music", definition: "Music", kind: "interest", embedding: vector,
            personas: [{ persona: "Friends", affinity: id === "a" ? 0.8 : 0.5 }, { persona: "Work", affinity: -0.5 }],
          }],
          kind_vectors: { interest: vector },
        } },
        { path: `${id}/${id}-relations.json`, content: { identity_id: id, relations: [] } },
      );
    }
    browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/files", route => route.fulfill({ json: files }));
    await page.route("**/api/modes", route => route.fulfill({ json: {
      revision: "test", data: { embedding_model: { name: "test", version: "1", dimensions: 16 }, modes: {} },
    } }));
    await page.goto(`http://127.0.0.1:${address.port}/#match-preview`);
    const root = page.locator("#page");
    await root.getByRole("heading", { name: "Match preview" }).waitFor();
    assert.match(await root.locator(".matrix").innerText(), /0\.400/);
    assert.match(await root.locator(".matrix").innerText(), /0\.250/);
    for (const [id, title] of [
      ["preferences", "Preferences"], ["matrix", "Affinity matrix"], ["profile", "Profile editor"],
      ["personas", "Personas"], ["persona-network", "Persona ↔ preference network"],
      ["similarity-network", "Persona similarity network"], ["topic-network", "Identity ↔ topic network"],
      ["embeddings", "Embeddings heatmap"],
    ]) {
      await page.locator(`#menu a[data-id="${id}"]`).click();
      await root.getByRole("heading", { name: title }).waitFor();
      await page.waitForTimeout(100);
    }
    await page.locator("#menu a[data-id=\"personas\"]").click();
    await root.locator("select.owner").selectOption("a");
    await root.getByRole("button", { name: "Add persona" }).click();
    await root.getByRole("button", { name: "Add persona" }).click();
    await page.locator("#menu a[data-id=\"preferences-edit\"]").click();
    await root.getByRole("heading", { name: "Preferences: Edit" }).waitFor();
    assert.equal(await root.locator("summary").filter({ hasText: /^new persona ·/ }).count(), 1);
    assert.equal(await root.locator("summary").filter({ hasText: /^new persona 2 ·/ }).count(), 1);
    assert.deepEqual(errors, []);
  }
  finally {
    await browser?.close();
    await server.close();
  }
});
