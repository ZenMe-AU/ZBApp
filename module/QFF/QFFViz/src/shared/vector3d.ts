/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import Plotly, { type Data, type PlotlyHTMLElement } from "plotly.js-dist-min";
import * as echarts from "echarts";
import "echarts-gl";
import { createGrid, type ColDef, type GridApi } from "ag-grid-community";
import { esc, openInfo, q } from "./dom";
import { project3d, type Projection3d } from "./projection3d";

type PlotCamera = NonNullable<NonNullable<PlotlyHTMLElement["layout"]["scene"]>["camera"]>;

export interface Vector3dPoint<Row extends { id: string }> {
  row: Row
  vector: number[]
  group: string
  color: string
  shape: "triangle" | "circle"
  size: number
  selectedSize: number
  label: string
  detail: string
  note?: string
}

export interface Vector3dData<Row extends { id: string }> {
  points: Vector3dPoint<Row>[]
  warnings: string[]
  notices: string[]
}

export interface Vector3dOptions<Row extends { id: string }> {
  title: string
  helpTitle: string
  help: string
  engine: "plotly" | "echarts"
  fields: { field: keyof Row & string, label: string }[]
  columns: ColDef<Row>[]
  emptyMessage?: string
  getData: () => Vector3dData<Row>
  subscribe?: (refresh: () => void) => () => void
}

interface ECharts3DPoint {
  name: string
  value: number[]
  id: string
  note?: string
  itemStyle: { color: string, borderColor: string, borderWidth: number }
}

interface ECharts3DSeries {
  type: "scatter3D"
  name: string
  symbol: "triangle" | "circle"
  symbolSize: (_value: unknown, params: { dataIndex: number }) => number
  tooltip: { extraCssText: string }
  data: ECharts3DPoint[]
}

interface ECharts3DAxis {
  type: "value"
  min: number
  max: number
  name: ""
  axisLabel: { show: false }
  axisTick: { show: false }
}

interface ECharts3DOption {
  animation: boolean
  tooltip: { formatter: (params: echarts.TooltipComponentFormatterCallbackParams) => string, className: string }
  xAxis3D: ECharts3DAxis
  yAxis3D: ECharts3DAxis
  zAxis3D: ECharts3DAxis
  grid3D: {
    viewControl: { projection: "perspective", distance: number, zoomSensitivity: number }
    axisPointer: { lineStyle: { opacity: number } }
  }
  graphic: { type: "text", left: "center", top: "middle", style: { text: string, fill: string } }[]
  series: ECharts3DSeries[]
}

function wrapHoverText(text: string): string {
  const lines: string[] = [];
  for (const word of text.trim().split(/\s+/u)) {
    const last = lines.length - 1;
    if (last >= 0 && lines[last].length + 1 + word.length <= 40) lines[last] += ` ${word}`;
    else lines.push(...(word.match(/.{1,40}/gu) ?? []));
  }
  return lines.map(esc).join("<br>");
}

export function renderVector3d<Row extends { id: string }>(root: HTMLElement, options: Vector3dOptions<Row>): () => void {
  root.classList.add("vector-grid-page");
  root.innerHTML = `
    <div class="toolbar">
      <h2>${esc(options.title)} <button class="info-btn" aria-label="How to read ${esc(options.title.toLowerCase())}">ⓘ</button></h2>
      <label>Projection <select class="proj"><option value="umap">UMAP</option><option value="pca">PCA</option><option value="tsne">t-SNE</option></select></label>
      <label><input type="checkbox" class="show-data" /> Show data</label>
      <span class="hint selection-info" role="status"></span>
      <label class="quick-search">Quick search <input class="filter-search" type="search" placeholder="Filter plot and grid..." /></label>
      <div class="vector-warnings"></div>
    </div>
    <p class="hint projection-info" role="status" hidden></p>
    <div class="detail-box" role="status" aria-live="polite" hidden></div>
    <div class="vector-plot-wrap is-filter-open">
      <div class="plot"></div>
      <aside class="vector-filter-panel" aria-label="Vector filters">
        <button class="show-all">Clear filters</button>
        <label class="sr-only" for="vector-filter-search">Search filter attributes</label>
        <input id="vector-filter-search" class="vector-filter-search" type="search" placeholder="Search filters..." />
        <div class="vector-filter-fields"></div>
      </aside>
      <button class="vector-filter-toggle" type="button" aria-expanded="true">⌁ Filters</button>
    </div>
    <section class="vector-data" hidden><h3>Vector data</h3><p class="hint">Filtered rows are shown in the plot. Click rows or use checkboxes to select points; Ctrl-click adds or removes a selection.</p><div class="vector-grid"></div></section>`;
  q(root, ".info-btn").addEventListener("click", () => openInfo(options.helpTitle, options.help));
  const plot = q(root, ".plot");
  const chart = options.engine === "echarts" ? echarts.init(plot) : undefined;
  let data = options.getData();
  let projections = new Map<Projection3d, ReturnType<typeof project3d>>();
  let disposed = false;
  let drawing = false;
  let queued = false;
  let grid: GridApi<Row> | undefined;
  const selectedIds = new Set<string>();
  const filterSelections = new Map<keyof Row & string, Set<string>>();
  const filterText = new Map<keyof Row & string, string>();
  let plotEventsAttached = false;
  let plottedProjection: string | undefined;
  let plotGesture: { additive: boolean, handled: boolean } | undefined;

  const beginPlotGesture = (event: PointerEvent) => {
    plotGesture = { additive: event.ctrlKey || event.metaKey, handled: event.button !== 0 };
  };
  plot.addEventListener("pointerdown", beginPlotGesture, true);
  const plotCamera = (): PlotCamera | undefined => {
    // Plotly's layout and relayout events can lag behind its live 3D camera.
    const graph = plot as PlotlyHTMLElement & { _fullLayout?: { scene?: { _scene?: { getCamera?: () => PlotCamera } } } };
    const scene = graph._fullLayout?.scene?._scene;
    if (typeof scene?.getCamera === "function") return scene.getCamera();
    console.warn("Plotly's live 3D camera is unavailable; using the last saved camera.");
    return graph.layout?.scene?.camera;
  };
  const zoomPlot = (event: WheelEvent) => {
    event.preventDefault();
    const camera = plotCamera();
    const eye = camera?.eye ?? { x: 1.25, y: 1.25, z: 1.25 };
    const x = eye.x ?? 1.25;
    const y = eye.y ?? 1.25;
    const z = eye.z ?? 1.25;
    const distance = Math.hypot(x, y, z);
    const targetDistance = Math.min(10, Math.max(0.1, distance * (event.deltaY > 0 ? 1.05 : 0.95)));
    const scale = targetDistance / distance;
    void Plotly.relayout(plot, { "scene.camera": { ...camera, eye: { x: x * scale, y: y * scale, z: z * scale } } });
  };
  const passPageScroll = (event: WheelEvent) => {
    if (!event.ctrlKey) event.stopImmediatePropagation();
    else if (!chart) {
      event.stopImmediatePropagation();
      zoomPlot(event);
    }
  };
  plot.addEventListener("wheel", passPageScroll, true);
  let echartsDistance = 160;
  const zoomEcharts = (event: WheelEvent) => {
    if (!event.ctrlKey || !chart) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    echartsDistance = Math.min(500, Math.max(20, echartsDistance * (event.deltaY > 0 ? 1.05 : 0.95)));
    chart.setOption({ grid3D: { viewControl: { distance: echartsDistance } } });
  };
  if (chart) plot.addEventListener("wheel", zoomEcharts, { passive: false });

  const showDetail = (id?: string) => {
    const detail = q<HTMLElement>(root, ".detail-box");
    detail.textContent = data.points.find(point => point.row.id === id)?.detail ?? "";
    detail.hidden = !detail.textContent;
  };
  const controls = () => {
    const warnings = q<HTMLElement>(root, ".vector-warnings");
    warnings.innerHTML = `
      ${data.notices.map(notice => `<p class="hint">${esc(notice)}</p>`).join("")}
      ${data.warnings.length ? `<details><summary class="vector-error">Unavailable vectors (${data.warnings.length})</summary><ul>${data.warnings.map(w => `<li>${esc(w)}</li>`).join("")}</ul></details>` : ""}`;
    warnings.hidden = !data.notices.length && !data.warnings.length;
  };
  const renderFilterFields = () => {
    const rows = data.points.map(point => point.row);
    const fields = options.fields.map(({ field, label: fieldLabel }) => {
      const values = [...new Set(rows.map(row => String(row[field] ?? "")))].sort((a, b) => a.localeCompare(b));
      const selected = filterSelections.get(field);
      if (selected) {
        const valid = new Set([...selected].filter(value => values.includes(value)));
        if (valid.size === values.length) filterSelections.delete(field);
        else filterSelections.set(field, valid);
      }
      const section = document.createElement("details");
      section.className = "vector-filter-field";
      section.dataset.filterField = `${fieldLabel} ${field}`.toLowerCase();
      const summary = document.createElement("summary");
      summary.textContent = fieldLabel;
      const body = document.createElement("div");
      body.className = "vector-filter-body";
      if (values.length > 20) {
        const input = document.createElement("input");
        input.type = "search";
        input.placeholder = `Filter ${fieldLabel.toLowerCase()} values...`;
        input.value = filterText.get(field) ?? "";
        input.addEventListener("input", () => {
          const query = input.value.trim().toLowerCase();
          if (query) filterText.set(field, query);
          else filterText.delete(field);
          grid?.onFilterChanged();
        });
        body.append(input);
      }
      else {
        const selectedValues = new Set(filterSelections.get(field) ?? values);
        const checks: HTMLInputElement[] = [];
        const addOption = (text: string, value: string, selectAll = false) => {
          const label = document.createElement("label");
          label.className = "vector-filter-value";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = selectAll || selectedValues.has(value);
          if (selectAll) checkbox.className = "select-all";
          else checks.push(checkbox);
          checkbox.addEventListener("change", () => {
            if (selectAll) checks.forEach((option) => { option.checked = checkbox.checked; });
            else {
              const all = body.querySelector<HTMLInputElement>(".select-all")!;
              all.checked = checks.every(option => option.checked);
              all.indeterminate = !all.checked && checks.some(option => option.checked);
            }
            const checked = new Set(values.filter((_, index) => checks[index].checked));
            if (checked.size === values.length) filterSelections.delete(field);
            else filterSelections.set(field, checked);
            grid?.onFilterChanged();
          });
          label.append(checkbox, document.createTextNode(text || "(empty)"));
          body.append(label);
        };
        addOption("(Select All)", "", true);
        values.forEach(value => addOption(value, value));
        const all = body.querySelector<HTMLInputElement>(".select-all")!;
        all.checked = selectedValues.size === values.length;
        all.indeterminate = !all.checked && selectedValues.size > 0;
      }
      section.append(summary, body);
      return section;
    });
    q(root, ".vector-filter-fields").replaceChildren(...fields);
  };

  const selectPoint = (id: unknown, additive: boolean) => {
    if (typeof id !== "string" || !grid) return;
    const node = grid.getRowNode(id);
    if (!node || plotGesture?.handled) return;
    if (plotGesture) plotGesture.handled = true;
    node.setSelected(additive ? !node.isSelected() : true, !additive);
    if (!q<HTMLElement>(root, ".vector-data").hidden) grid.ensureNodeVisible(node);
  };

  const draw = async () => {
    if (disposed) return;
    if (drawing) {
      queued = true;
      return;
    }
    drawing = true;
    try {
      const filteredIds = new Set<string>();
      grid?.forEachNodeAfterFilter((node) => { if (node.data) filteredIds.add(node.data.id); });
      const visible = data.points.filter(point => filteredIds.has(point.row.id));
      q<HTMLButtonElement>(root, ".vector-filter-toggle").textContent = `⌁ Filters (${visible.length}/${data.points.length})`;
      q(root, ".selection-info").textContent = `${selectedIds.size} selected`;
      const traces: Data[] = [];
      const series: ECharts3DSeries[] = [];
      let axisRanges: [number, number][] | undefined;
      if (data.points.length) {
        const method = q<HTMLSelectElement>(root, ".proj").value as Projection3d;
        if (!projections.has(method)) projections.set(method, project3d(data.points.map(point => point.vector), method));
        const projection = projections.get(method)!;
        axisRanges = [0, 1, 2].map((axis): [number, number] => {
          const values = projection.coords.map(point => point[axis]);
          const min = Math.min(...values), max = Math.max(...values);
          const padding = (max - min) * 0.08 || 1;
          return [min - padding, max + padding];
        });
        const index = new Map(data.points.map((point, i) => [point.row.id, i]));
        const groups = new Map<string, Vector3dPoint<Row>[]>();
        for (const point of visible) {
          const key = JSON.stringify([point.group, point.color, point.shape]);
          const members = groups.get(key) ?? [];
          members.push(point);
          groups.set(key, members);
        }
        const hoverStyle = getComputedStyle(plot);
        for (const members of groups.values()) {
          const { group, color, shape } = members[0];
          const coords = members.map(point => projection.coords[index.get(point.row.id)!]);
          const size = (point: Vector3dPoint<Row>) => selectedIds.has(point.row.id) ? point.selectedSize : point.size;
          if (chart) {
            series.push({
              type: "scatter3D", name: group, symbol: shape,
              tooltip: { extraCssText: `--graph-hover-color: ${color};` },
              symbolSize: (_value, params) => size(members[params.dataIndex]),
              data: members.map((point, i) => ({
                name: point.label, value: coords[i], id: point.row.id, note: point.note,
                itemStyle: {
                  color,
                  borderColor: selectedIds.has(point.row.id) ? "#1f2933" : color,
                  borderWidth: selectedIds.has(point.row.id) ? 2 : 0,
                },
              })),
            });
          }
          else {
            const triangle = shape === "triangle";
            traces.push({
              type: "scatter3d", name: group, showlegend: false,
              mode: triangle ? "text+markers" : "markers",
              x: coords.map(point => point[0]), y: coords.map(point => point[1]), z: coords.map(point => point[2]),
              // Plotly scatter3d has no triangle marker; camera-facing text preserves the shape.
              text: triangle ? members.map(() => "▲") : undefined,
              textposition: "middle center",
              textfont: { color, size: members.some(point => selectedIds.has(point.row.id)) ? 34 : 28 },
              customdata: members.map(point => [point.row.id, `${wrapHoverText(point.label)}${point.note ? `<br>${esc(point.note)}` : ""}`]),
              hovertemplate: "%{customdata[1]}<extra></extra>",
              hoverlabel: { bgcolor: color, font: { family: hoverStyle.fontFamily, size: parseFloat(hoverStyle.fontSize), color: hoverStyle.color } },
              marker: {
                symbol: "circle",
                size: members.map(size),
                color: triangle ? "rgba(0,0,0,0)" : color,
                line: { color: members.map(point => selectedIds.has(point.row.id) ? "#1f2933" : triangle ? "rgba(0,0,0,0)" : color), width: 2 },
              },
            });
          }
        }
      }
      const status = q<HTMLElement>(root, ".projection-info");
      status.textContent = "";
      status.hidden = true;
      showDetail();
      const emptyText = options.emptyMessage ?? "No visible valid vectors. Clear filters or check the source data.";
      if (chart) {
        const ranges = axisRanges ?? [[0, 1], [0, 1], [0, 1]];
        const axis = (range: number[]): ECharts3DAxis => ({
          type: "value", min: range[0], max: range[1], name: "", axisLabel: { show: false }, axisTick: { show: false },
        });
        const option: ECharts3DOption = {
          animation: false,
          tooltip: {
            className: "graph-hover-label",
            formatter: (params) => {
              const point = (Array.isArray(params) ? params[0] : params).data as ECharts3DPoint;
              return `${esc(point.name)}${point.note ? `<br>${esc(point.note)}` : ""}`;
            },
          },
          xAxis3D: axis(ranges[0]), yAxis3D: axis(ranges[1]), zAxis3D: axis(ranges[2]),
          grid3D: {
            viewControl: { projection: "perspective", distance: echartsDistance, zoomSensitivity: 0 },
            axisPointer: { lineStyle: { opacity: 0.2 } },
          },
          graphic: series.length ? [] : [{ type: "text", left: "center", top: "middle", style: { text: emptyText, fill: "#1f2933" } }],
          series,
        };
        // ECharts GL currently ships no TypeScript option declarations.
        chart.setOption(option as unknown as echarts.EChartsOption, { replaceMerge: ["series", "graphic"] });
      }
      else {
        const revision = q<HTMLSelectElement>(root, ".proj").value;
        const camera = plottedProjection === revision ? plotCamera() : undefined;
        await Plotly.react(plot, traces, {
          uirevision: revision,
          margin: { l: 0, r: 0, t: 0, b: 0 },
          scene: {
            camera,
            xaxis: { title: { text: "" }, range: axisRanges?.[0], spikecolor: "rgba(0,0,0,0.2)" },
            yaxis: { title: { text: "" }, range: axisRanges?.[1], spikecolor: "rgba(0,0,0,0.2)" },
            zaxis: { title: { text: "" }, range: axisRanges?.[2], spikecolor: "rgba(0,0,0,0.2)" },
          },
          xaxis: { automargin: true },
          yaxis: { automargin: true, tickmode: "auto" },
          annotations: !traces.length ? [{ text: emptyText, showarrow: false, xref: "paper", yref: "paper", x: 0.5, y: 0.5 }] : [],
        }, { responsive: true, displaylogo: false, scrollZoom: false });
        plottedProjection = revision;
      }
      if (!chart && !plotEventsAttached && !disposed) {
        (plot as PlotlyHTMLElement).on("plotly_hover", (event) => {
          const custom = event.points[0]?.customdata;
          showDetail(Array.isArray(custom) && typeof custom[0] === "string" ? custom[0] : undefined);
        });
        (plot as PlotlyHTMLElement).on("plotly_unhover", () => showDetail());
        (plot as PlotlyHTMLElement).on("plotly_click", (event) => {
          const custom = event.points[0]?.customdata;
          const mouse = (event as typeof event & { event?: MouseEvent }).event;
          selectPoint(Array.isArray(custom) ? custom[0] : undefined, mouse ? mouse.ctrlKey || mouse.metaKey : plotGesture?.additive ?? false);
        });
        plotEventsAttached = true;
      }
    }
    catch (err) {
      if (!disposed) {
        const status = q<HTMLElement>(root, ".projection-info");
        status.textContent = `Unable to display vectors: ${err instanceof Error ? err.message : String(err)}`;
        status.hidden = false;
      }
    }
    finally {
      drawing = false;
      if (disposed) {
        if (chart) chart.dispose();
        else Plotly.purge(plot);
      }
      else if (queued) {
        queued = false;
        void draw();
      }
    }
  };

  q<HTMLSelectElement>(root, ".proj").addEventListener("change", () => void draw());
  q(root, ".show-all").addEventListener("click", () => {
    q<HTMLInputElement>(root, ".filter-search").value = "";
    q<HTMLInputElement>(root, ".vector-filter-search").value = "";
    filterSelections.clear();
    filterText.clear();
    grid?.setGridOption("quickFilterText", "");
    grid?.setFilterModel(null);
    renderFilterFields();
    grid?.onFilterChanged();
    controls();
    void draw();
  });
  const refresh = () => {
    data = options.getData();
    projections = new Map();
    controls();
    grid?.setGridOption("rowData", data.points.map(point => point.row));
    renderFilterFields();
    grid?.onFilterChanged();
    void draw();
  };
  const unsubscribe = options.subscribe?.(refresh);
  const resize = new ResizeObserver(() => {
    if (disposed) return;
    if (chart) chart.resize();
    else if ((plot as PlotlyHTMLElement).data) Plotly.Plots.resize(plot);
  });
  resize.observe(plot);
  controls();
  grid = createGrid<Row>(q(root, ".vector-grid"), {
    rowData: data.points.map(point => point.row),
    getRowId: params => params.data.id,
    domLayout: "autoHeight",
    defaultColDef: { filter: true, floatingFilter: true, sortable: true, resizable: true, flex: 1, minWidth: 105 },
    rowSelection: { mode: "multiRow", enableClickSelection: true },
    columnDefs: options.columns,
    isExternalFilterPresent: () => filterSelections.size > 0 || filterText.size > 0,
    doesExternalFilterPass: (node) => {
      if (!node.data) return false;
      return [...filterSelections].every(([field, selected]) => selected.has(String(node.data![field] ?? "")))
        && [...filterText].every(([field, query]) => String(node.data![field] ?? "").toLowerCase().includes(query));
    },
    onFilterChanged: () => { void draw(); },
    onSelectionChanged: (event) => {
      selectedIds.clear();
      event.api.getSelectedRows().forEach(row => selectedIds.add(row.id));
      void draw();
    },
  });
  chart?.on("click", (event) => {
    if (event.seriesType !== "scatter3D") return;
    const id = (event.data as { id?: unknown } | undefined)?.id;
    selectPoint(id, plotGesture?.additive ?? false);
  });
  chart?.on("mouseover", (event) => {
    const id = (event.data as { id?: unknown } | undefined)?.id;
    showDetail(typeof id === "string" ? id : undefined);
  });
  chart?.on("mouseout", () => showDetail());
  q<HTMLInputElement>(root, ".filter-search").addEventListener("input", event =>
    grid!.setGridOption("quickFilterText", (event.target as HTMLInputElement).value));
  q<HTMLInputElement>(root, ".vector-filter-search").addEventListener("input", (event) => {
    const query = (event.target as HTMLInputElement).value.trim().toLowerCase();
    for (const section of q(root, ".vector-filter-fields").children) {
      (section as HTMLElement).hidden = Boolean(query) && !(section as HTMLElement).dataset.filterField!.includes(query);
    }
  });
  q<HTMLButtonElement>(root, ".vector-filter-toggle").addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const open = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(open));
    q<HTMLElement>(root, ".vector-filter-panel").hidden = !open;
    q<HTMLElement>(root, ".vector-plot-wrap").classList.toggle("is-filter-open", open);
    if (chart) chart.resize();
    else void Plotly.Plots.resize(plot);
  });
  renderFilterFields();
  q<HTMLInputElement>(root, ".show-data").addEventListener("change", (event) => {
    q<HTMLElement>(root, ".vector-data").hidden = !(event.target as HTMLInputElement).checked;
  });
  void draw();
  return () => {
    disposed = true;
    resize.disconnect();
    unsubscribe?.();
    grid?.destroy();
    plot.removeEventListener("pointerdown", beginPlotGesture, true);
    plot.removeEventListener("wheel", passPageScroll, true);
    plot.removeEventListener("wheel", zoomEcharts);
    root.classList.remove("vector-grid-page");
    if (!drawing) {
      if (chart) chart.dispose();
      else Plotly.purge(plot);
    }
  };
}
