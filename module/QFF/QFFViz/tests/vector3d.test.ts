/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import type { Vector3dData, Vector3dPoint } from "../src/shared/vector3d.ts";

interface SyntheticRow {
  id: string
  name: string
  kind: string
}

interface TestPlot extends HTMLElement {
  data?: { customdata: [string][] }[]
  layout: { annotations: { text: string }[] }
  emit: (event: string, data: { points: { customdata: string[] }[] }) => void
}

interface TestChart {
  getOption: () => {
    series: { data: { id: string }[] }[]
    graphic: { elements: { style: { text: string } }[] }[]
  }
  trigger: (event: string, data: { data: { id: string } }) => void
}

declare global {
  interface Window {
    syntheticData: Vector3dData<SyntheticRow>
    syntheticPoints: Vector3dPoint<SyntheticRow>[]
    syntheticRefresh: (() => void) | null
    syntheticDispose: () => void
  }
}

test("3D template renders and refreshes a non-mode dataset in both engines", { timeout: 120_000 }, async () => {
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
    const port = address.port;
    browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.locator("#menu a").first().waitFor();

    for (const engine of ["plotly", "echarts"] as const) {
      await page.evaluate(async (engine) => {
        const url = "/src/shared/vector3d.ts";
        const { renderVector3d }: typeof import("../src/shared/vector3d.ts") = await import(url);
        const root = document.createElement("div");
        root.id = "synthetic";
        root.style.cssText = "position:fixed;inset:0;background:white;z-index:9999;overflow:auto";
        document.body.append(root);
        window.syntheticData = {
          points: [
            { row: { id: "a", name: "Alpha", kind: "one" }, vector: [1, 0, 0], group: "one", color: "#f00", shape: "triangle", size: 10, selectedSize: 13, label: "Alpha", detail: "Alpha details" },
            { row: { id: "b", name: "Beta", kind: "one" }, vector: [0, 1, 0], group: "one", color: "#f00", shape: "circle", size: 6, selectedSize: 10, label: "Beta", detail: "Beta details" },
            { row: { id: "c", name: "Gamma", kind: "two" }, vector: [0, 0, 1], group: "two", color: "#00f", shape: "circle", size: 6, selectedSize: 10, label: "Gamma", detail: "Gamma details" },
          ],
          warnings: ["Bad <vector>"],
          notices: ["Synthetic data"],
        };
        window.syntheticDispose = renderVector3d(root, {
          title: "Synthetic 3D", helpTitle: "Synthetic", help: "", engine,
          fields: [{ field: "kind", label: "Kind" }],
          columns: [{ field: "name" }, { field: "kind" }],
          getData: () => window.syntheticData,
          subscribe: (refresh) => {
            window.syntheticRefresh = refresh;
            return () => {
              window.syntheticRefresh = null;
            };
          },
        });
      }, engine);
      const root = page.locator("#synthetic");
      await page.waitForFunction(() => document.querySelector("#synthetic .vector-filter-toggle")?.textContent?.includes("(3/3)"));
      await page.waitForFunction((engine) => {
        const plot = document.querySelector<TestPlot>("#synthetic .plot");
        return engine === "plotly" ? plot?.data?.length === 3 : plot?.querySelector("canvas");
      }, engine);
      assert.match(await root.locator(".vector-warnings").textContent() ?? "", /Bad <vector>/);
      assert.equal(await root.locator(".vector-warnings vector").count(), 0);

      await root.locator(".filter-search").fill("Beta");
      await page.waitForFunction(() => document.querySelector("#synthetic .vector-filter-toggle")?.textContent?.includes("(1/3)"));
      await page.waitForFunction(async (engine) => {
        const plot = document.querySelector<TestPlot>("#synthetic .plot");
        if (!plot) return false;
        if (engine === "plotly") return plot.data?.length === 1 && plot.data[0].customdata[0][0] === "b";
        const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => name.includes("/deps/echarts.js?v="));
        if (!url) return false;
        const chart: TestChart = (await import(url)).getInstanceByDom(plot);
        const series = chart.getOption().series;
        return series.length === 1 && series[0].data[0].id === "b";
      }, engine);
      await page.evaluate(async (engine) => {
        const plot = document.querySelector<TestPlot>("#synthetic .plot");
        if (!plot) throw new Error("Synthetic plot is missing");
        if (engine === "plotly") plot.emit("plotly_hover", { points: [{ customdata: ["b"] }] });
        else {
          const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => name.includes("/deps/echarts.js?v="));
          if (!url) throw new Error("ECharts module is missing");
          const chart: TestChart = (await import(url)).getInstanceByDom(plot);
          chart.trigger("mouseover", { data: { id: "b" } });
        }
      }, engine);
      assert.equal(await root.locator(".detail-box").textContent(), "Beta details");
      await root.locator(".show-data").check();
      await root.getByRole("checkbox", { name: "Press Space to toggle row selection (unchecked)" }).first().check();
      await page.waitForFunction(() => document.querySelector("#synthetic .selection-info")?.textContent === "1 selected");
      await root.locator(".show-all").click();
      await page.waitForFunction(() => document.querySelector("#synthetic .vector-filter-toggle")?.textContent?.includes("(3/3)"));
      assert.equal(await root.locator(".selection-info").textContent(), "1 selected");

      await page.evaluate(() => {
        window.syntheticPoints = window.syntheticData.points;
        window.syntheticData.points = [];
        if (!window.syntheticRefresh) throw new Error("Synthetic refresh is missing");
        window.syntheticRefresh();
      });
      await page.waitForFunction(() => document.querySelector("#synthetic .vector-filter-toggle")?.textContent?.includes("(0/0)"));
      await page.waitForFunction(async (engine) => {
        const plot = document.querySelector<TestPlot>("#synthetic .plot");
        if (!plot) return false;
        if (engine === "plotly") return plot.data?.length === 0 && plot.layout.annotations[0]?.text.includes("No visible valid vectors");
        const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => name.includes("/deps/echarts.js?v="));
        if (!url) return false;
        const chart: TestChart = (await import(url)).getInstanceByDom(plot);
        return chart.getOption().graphic[0]?.elements?.[0]?.style.text.includes("No visible valid vectors");
      }, engine);
      assert.equal(await root.locator(".projection-info").textContent(), "");
      await page.evaluate(() => {
        window.syntheticData.points = window.syntheticPoints;
        if (!window.syntheticRefresh) throw new Error("Synthetic refresh is missing");
        window.syntheticRefresh();
      });
      await page.waitForFunction(() => document.querySelector("#synthetic .vector-filter-toggle")?.textContent?.includes("(3/3)"));
      await page.evaluate(() => {
        window.syntheticDispose();
        document.querySelector("#synthetic")?.remove();
      });
      assert.equal(await page.evaluate(() => window.syntheticRefresh), null);
    }
  }
  finally {
    await browser?.close();
    await server.close();
  }
});
