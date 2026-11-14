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
  data?: { customdata: [string][], text?: string[], mode: string, marker: { line: { color: string[] } } }[]
  layout: { annotations: { text: string }[] }
  emit: (event: string, data: { points: { customdata: string[] }[] }) => void
}

interface TestChart {
  getOption: () => {
    series: { symbol: string, data: { id: string, itemStyle: { borderWidth: number } }[] }[]
    graphic: { elements: { style: { text: string } }[] }[]
  }
  trigger: (event: string, data: { data: { id: string } }) => void
  getModel: () => { getSeriesByIndex: (index: number) => object }
  getViewOfSeriesModel: (series: object) => { _pointsBuilderList: { _spriteImageCanvas: HTMLCanvasElement }[] }
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
            { row: { id: "b", name: "Beta", kind: "one" }, vector: [0, 1, 0], group: "one", color: "#f00", shape: "plus", size: 8, selectedSize: 12, label: "Beta", detail: "Beta details" },
            { row: { id: "c", name: "Gamma", kind: "two" }, vector: [0, 0, 1], group: "two", color: "#00f", shape: "minus", size: 8, selectedSize: 12, label: "Gamma", detail: "Gamma details" },
            { row: { id: "d", name: "Delta", kind: "two" }, vector: [1, 1, 1], group: "two", color: "#00f", shape: "circle", size: 6, selectedSize: 10, label: "Delta", detail: "Delta details" },
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
      await page.waitForFunction(() => document.querySelector("#synthetic .vector-filter-toggle")?.textContent?.includes("(4/4)"));
      await page.waitForFunction((engine) => {
        const plot = document.querySelector<TestPlot>("#synthetic .plot");
        return engine === "plotly" ? plot?.data?.length === 4 : plot?.querySelector("canvas");
      }, engine);
      const markers = await page.evaluate(async (engine) => {
        const plot = document.querySelector<TestPlot>("#synthetic .plot");
        if (!plot) throw new Error("Synthetic plot is missing");
        if (engine === "plotly") return {
          engine,
          markers: Object.fromEntries((plot.data ?? []).map(trace => [trace.customdata[0][0], { text: trace.text?.[0], mode: trace.mode }])),
        };
        const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => name.includes("/deps/echarts.js?v="));
        if (!url) throw new Error("ECharts module is missing");
        const chart: TestChart = (await import(url)).getInstanceByDom(plot);
        return {
          engine,
          markers: Object.fromEntries(chart.getOption().series.map((series, index) => {
            const view = chart.getViewOfSeriesModel(chart.getModel().getSeriesByIndex(index));
            const canvas = view._pointsBuilderList[0]._spriteImageCanvas;
            const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
            const xs: number[] = [];
            const ys: number[] = [];
            for (let y = 0; y < canvas.height; y++) {
              for (let x = 0; x < canvas.width; x++) {
                if (pixels[(y * canvas.width + x) * 4 + 3] > 128) {
                  xs.push(x);
                  ys.push(y);
                }
              }
            }
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minY = Math.min(...ys), maxY = Math.max(...ys);
            const corner = xs.some((x, i) => x < minX + (maxX - minX) * 0.25 && ys[i] < minY + (maxY - minY) * 0.25);
            return [series.data[0].id, { symbol: series.symbol, width: maxX - minX + 1, height: maxY - minY + 1, corner }];
          })),
        };
      }, engine);
      if (markers.engine === "plotly") {
        assert.deepEqual(markers.markers.b, { text: "+", mode: "text+markers" });
        assert.deepEqual(markers.markers.c, { text: "−", mode: "text+markers" });
        assert.equal(markers.markers.d.mode, "markers");
      }
      else {
        const { b, c, d } = markers.markers;
        assert.match(b.symbol, /^path:\/\//);
        assert.match(c.symbol, /^path:\/\//);
        assert.ok(b.height >= b.width * 0.8, "plus marker must be as tall as it is wide");
        assert.equal(b.corner, false, "plus marker must not be a filled square");
        assert.ok(c.width >= c.height * 2, "minus marker must be wider than it is tall");
        assert.equal(d.symbol, "circle");
      }
      assert.match(await root.locator(".vector-warnings").textContent() ?? "", /Bad <vector>/);
      assert.equal(await root.locator(".vector-warnings vector").count(), 0);

      await root.locator(".filter-search").fill("Beta");
      await page.waitForFunction(() => document.querySelector("#synthetic .vector-filter-toggle")?.textContent?.includes("(1/4)"));
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
      await page.waitForFunction(async (engine) => {
        const plot = document.querySelector<TestPlot>("#synthetic .plot");
        if (!plot) return false;
        if (engine === "plotly") return plot.data?.[0]?.marker.line.color[0] === "#1f2933";
        const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => name.includes("/deps/echarts.js?v="));
        if (!url) return false;
        const chart: TestChart = (await import(url)).getInstanceByDom(plot);
        return chart.getOption().series[0]?.data[0]?.itemStyle.borderWidth === 2;
      }, engine);
      await root.locator(".show-all").click();
      await page.waitForFunction(() => document.querySelector("#synthetic .vector-filter-toggle")?.textContent?.includes("(4/4)"));
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
      await page.waitForFunction(() => document.querySelector("#synthetic .vector-filter-toggle")?.textContent?.includes("(4/4)"));
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
