/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

test("mode editing works without keyword scoring", { timeout: 120_000 }, async () => {
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
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.route("**/editor-test", route => route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><div id=\"editor\"></div>",
    }));
    await page.goto(`http://127.0.0.1:${address.port}/editor-test`);
    await page.evaluate(async () => {
      const storeUrl = "/src/data/store.ts";
      const editorUrl = "/src/pages/modesEdit.ts";
      const { store }: typeof import("../src/data/store.ts") = await import(storeUrl);
      const { render }: typeof import("../src/pages/modesEdit.ts") = await import(editorUrl);
      const data = {
        embedding_model: { name: "test", version: "1", dimensions: 2 },
        modes: {
          Learn: {
            definition: "Learn something",
            vector: [1, 0],
            submodes: [{ text: "Study", definition: "Study something", weight: 1, vector: [1, 0] }],
          },
        },
      };
      store.modes = { revision: "test", data };
      store.savedModes = structuredClone(data);
      render(document.querySelector<HTMLElement>("#editor")!);
    });

    const editor = page.locator("#editor");
    assert.equal(await editor.locator(".keyword, .score-col").count(), 0);
    assert.doesNotMatch(await editor.innerText(), /test keyword|keyword score|saved score|preview score/i);
    assert.equal(await editor.locator(".calculate").isEnabled(), true);
    assert.equal(await editor.locator(".refresh").isEnabled(), true);
    await editor.locator("summary").click();
    assert.equal(await editor.locator(".contribution").innerText(), "100.0%");
    await editor.locator("input[data-field=\"weight\"]").fill("2");
    await editor.locator("input[data-field=\"weight\"]").dispatchEvent("change");
    assert.match(await editor.locator(".message").innerText(), /Unsaved mode edits/);
    assert.equal(await editor.locator(".calculate").isDisabled(), true);
    assert.doesNotMatch(await editor.innerText(), /keyword score|saved score|preview score/i);
  }
  finally {
    await browser?.close();
    await server.close();
  }
});
