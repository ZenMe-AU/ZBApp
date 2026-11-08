/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import Plotly, { type Data, type PlotlyHTMLElement } from "plotly.js-dist-min";
import { createGrid, type GridApi } from "ag-grid-community";
import { store } from "../data/store";
import { esc, openInfo, q } from "../shared/dom";
import { modeColor } from "../shared/modes";
import { cosine } from "../shared/cosine";
import { modeGeometry, visibleModePoints, type ModePoint } from "../shared/modeGeometry";
import { project3d, type Projection3d } from "../shared/projection3d";

interface VectorRow {
  id: string;
  mode: string;
  type: string;
  text: string;
  weight: number | null;
  parentCosine: number | null;
  siblingCosine: number | null;
  rival: string;
  gap: number | null;
}

const help = `
  <p>Triangles are current weighted mode averages; circles are independently embedded submodes. Colours group each parent with its submodes. Zero-weight submodes are visible with smaller circles but do not affect averages.</p>
  <p>Averages are derived offline from the current draft. Nothing is saved. Missing/stale embeddings are listed, not fabricated. A parent whose saved average needs recalculation is marked “preview average”.</p>
  <h4>Projection versus alignment</h4>
  <p>UMAP (cosine, seed 42) highlights local neighbourhoods; global distances and apparent outliers can be misleading. PCA is linear and reports retained variance. Both use all valid points; hiding points does not refit or move the layout.</p>
  <p>Modes → Heatmap is a separate page for full-dimensional comparison. It compares each submode with every mode average and includes the alignment table. Hover for the exact cosine.</p>
  <p><b>Sibling cosine</b> compares a submode with the weighted parent average <em>excluding itself</em>, reducing self-inclusion bias. <b>Parent cosine</b> includes itself. <b>Rival</b> is its nearest other parent (including hidden modes); <b>gap</b> = sibling cosine − rival cosine. A negative gap suggests cross-mode ambiguity, not proof of incorrect wording. The table is sorted by weakest sibling alignment.</p>
  <h4>Testing alternative wording</h4>
  <p>Compare “attend” with “attend gallery” and “attend venue” as separately embedded submodes. Add candidates at weight zero in Modes → Edit, Save and Refresh embeddings; they can be evaluated without moving the parent average. Refresh automatically recalculates averages. Use sibling cosine, rival gap and keyword scores before assigning weight. Only the exact submode text is embedded, without the parent mode prefix.</p>
  <p>On 3D, rotate by dragging; wheel zooms and right-drag pans. Expand Filters for linked mode/submode choices and quick search. Show data reveals the supporting grid below the plot; its column filters also control the plot and remain active while the table is hidden. Clear filters restores all points.</p>
  <p>Click a point to select its grid row; Ctrl-click (or Command-click) toggles additional selections. Selecting grid rows highlights the same points. Filtering does not clear selection; selected points hidden by filters reappear highlighted when shown again.</p>
  <p>On Heatmap, mode checkboxes hide/show whole groups; submode choices are retained while their parent is hidden. Show all restores every point.</p>`;

export const render3d = (root: HTMLElement): (() => void) => render(root, false);
export const renderHeatmap = (root: HTMLElement): (() => void) => render(root, true);

function render(root: HTMLElement, heatmap: boolean): () => void {
  const title = heatmap ? "Heatmap" : "3D";
  if (!heatmap) root.classList.add("mode-grid-page");
  root.innerHTML = `
    <div class="toolbar">
      <h2>Modes: ${title} <button class="info-btn" aria-label="How to read mode ${title.toLowerCase()}">ⓘ</button></h2>
      ${heatmap ? "" : '<label>Projection <select class="proj"><option value="umap">UMAP</option><option value="pca">PCA</option></select></label>'}
      <button class="show-all">${heatmap ? "Show all" : "Clear filters"}</button>${heatmap ? "" : '<label><input type="checkbox" class="show-data" /> Show data</label><span class="hint">▲ Modes · ● Submodes</span><span class="hint selection-info" role="status"></span>'}
    </div>
    <p class="hint projection-info" role="status"></p>
    ${heatmap ? "" : `<details class="vector-filters"><summary>Filters <span class="filter-count"></span></summary>
      <div class="toolbar"><label>Mode <select class="filter-mode"><option value="">All modes</option></select></label>
      <label>Submode <select class="filter-submode"><option value="">All submodes</option></select></label>
      <label>Search <input class="filter-search" type="search" placeholder="Filter grid and plot..." /></label></div>
      <p class="hint">Submode choices depend on Mode. Show data to use column filters. All filters remain active when collapsed or hidden.</p>
    </details><div class="vector-warnings"></div>`}
    <div class="${heatmap ? "split mode-vectors" : "vector-plot-wrap"}">
      <div class="plot"></div>
      ${heatmap ? '<aside class="panel"><div class="vector-warnings"></div><h3>Visibility</h3><div class="visibility"></div><h3>Full-dimensional alignment</h3><p class="hint">Weakest sibling cosine first. Negative gap: closer to another mode. Hover scores for details.</p><div class="alignment"></div></aside>' : ""}
    </div>
    ${heatmap ? "" : '<section class="vector-data" hidden><h3>Vector data</h3><p class="hint">Filtered rows are shown in the plot. Click rows or use checkboxes to select points; Ctrl-click adds or removes a selection.</p><div class="vector-grid"></div></section>'}`;
  q(root, ".info-btn").addEventListener("click", () => openInfo(`Mode ${title.toLowerCase()} and outliers`, help));
  const plot = q(root, ".plot");
  let geometry = modeGeometry(store.modes!.data);
  const hiddenModes = new Set<string>();
  const hiddenSubmodes = new Set<string>();
  let projections = new Map<Projection3d, ReturnType<typeof project3d>>();
  let disposed = false;
  let drawing = false;
  let queued = false;
  let grid: GridApi<VectorRow> | undefined;
  const selectedIds = new Set<string>();
  let plotEventsAttached = false;
  let plotGesture: { additive: boolean; handled: boolean } | undefined;
  const beginPlotGesture = (event: PointerEvent) => {
    plotGesture = { additive: event.ctrlKey || event.metaKey, handled: event.button !== 0 };
  };
  if (!heatmap) plot.addEventListener("pointerdown", beginPlotGesture, true);
  const score = (value: number | null | undefined) => (value == null ? "—" : value.toFixed(3));
  const label = (p: ModePoint) => (p.submode === null ? `${p.mode} (mode)` : `${p.mode} / ${p.text}`);
  const gridRows = (): VectorRow[] => geometry.points.map((point) => {
    const alignment = geometry.alignment.find((a) => a.point.id === point.id);
    return {
      id: point.id, mode: point.mode, type: point.submode === null ? "Mode" : "Submode",
      text: point.text, weight: point.weight,
      parentCosine: alignment?.parentScore ?? null, siblingCosine: alignment?.siblingScore ?? null,
      rival: alignment?.rival?.mode ?? "", gap: alignment?.margin ?? null,
    };
  });
  const updateSubmodeChoices = () => {
    const mode = q<HTMLSelectElement>(root, ".filter-mode").value;
    const select = q<HTMLSelectElement>(root, ".filter-submode");
    const previous = select.value;
    const children = geometry.points.filter((p) => p.submode !== null && (!mode || p.mode === mode));
    select.innerHTML = '<option value="">All submodes</option>' +
      children.map((p) => `<option value="${esc(p.id)}">${esc(mode ? p.text : label(p))}</option>`).join("");
    select.value = children.some((p) => p.id === previous) ? previous : "";
  };

  const controls = () => {
    if (heatmap) q(root, ".visibility").innerHTML = Object.entries(store.modes!.data.modes)
      .map(
        ([name, mode], index) => `
      <details open>
        <summary><label style="color:${modeColor(name)}"><input type="checkbox" data-mode="${index}" ${hiddenModes.has(name) ? "" : "checked"} /> ${esc(name)}</label></summary>
        ${mode.submodes
          .map((submode, i) => {
            const id = `${name}:${i}`;
            const available = geometry.points.some((p) => p.id === id);
            return `<label class="submode-toggle" title="${esc(submode.text)}"><input type="checkbox" data-parent="${index}" data-submode="${i}"
            ${hiddenSubmodes.has(id) ? "" : "checked"} ${hiddenModes.has(name) || !available ? "disabled" : ""} />
            <span style="color:${modeColor(name)}">●</span> ${esc(submode.text)}${available ? "" : " (embedding unavailable)"}${submode.weight === 0 ? " (weight 0)" : ""}</label>`;
          })
          .join("")}
      </details>`
      )
      .join("");
    else {
      const select = q<HTMLSelectElement>(root, ".filter-mode");
      const previous = select.value;
      select.innerHTML = '<option value="">All modes</option>' +
        Object.keys(store.modes!.data.modes).map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join("");
      select.value = Object.hasOwn(store.modes!.data.modes, previous) ? previous : "";
      updateSubmodeChoices();
    }
    const preview = geometry.points.filter((p) => p.submode === null && p.issue).map((p) => p.mode);
    q(root, ".vector-warnings").innerHTML = `
      ${store.areModesDirty ? '<p class="hint">Showing unsaved mode draft.</p>' : ""}
      ${preview.length ? `<p class="hint">Preview averages: ${esc(preview.join(", "))}. Recalculate in Edit to persist.</p>` : ""}
      ${geometry.warnings.length ? `<details open><summary class="mode-error">Unavailable vectors (${geometry.warnings.length})</summary><ul>${geometry.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></details>` : ""}`;
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
      const visible = heatmap ? visibleModePoints(geometry.points, hiddenModes, hiddenSubmodes) :
        geometry.points.filter((p) => filteredIds.has(p.id));
      if (!heatmap) {
        q(root, ".filter-count").textContent = `(${visible.length} of ${geometry.points.length} points)`;
        q(root, ".selection-info").textContent = `${selectedIds.size} selected`;
      }
      const visibleIds = new Set(visible.map((p) => p.id));
      const rows = geometry.alignment.filter((a) => visibleIds.has(a.point.id));
      if (heatmap)
        q(root, ".alignment").innerHTML =
          `<table class="mini"><thead><tr><th>Submode</th><th>Parent</th><th>Sibling</th><th>Rival</th><th>Gap</th></tr></thead><tbody>${rows
            .map(
              (a) => `
        <tr><td style="color:${modeColor(a.point.mode)}">${esc(label(a.point))}</td>
        <td title="Cosine to parent including this submode">${score(a.parentScore)}</td>
        <td title="${esc(a.siblingIssue ?? "Cosine to parent excluding this submode")}">${score(a.siblingScore)}</td>
        <td title="Cosine ${score(a.rival?.score)}">${esc(a.rival?.mode ?? "—")}</td>
        <td class="${a.margin !== null && a.margin < 0 ? "mode-error" : ""}" title="Sibling cosine minus rival cosine">${score(a.margin)}</td></tr>`
            )
            .join("")}</tbody></table>`;
      let traces: Data[] = [];
      let info = "";
      let axisRanges: [number, number][] | undefined;
      if (heatmap) {
        const parents = visible.filter((p) => p.submode === null);
        const children = visible.filter((p) => p.submode !== null);
        traces =
          parents.length && children.length
            ? [
                {
                  type: "heatmap",
                  x: parents.map((p) => p.mode),
                  y: children.map((p) => p.id),
                  customdata: children.map((child) => parents.map(() => label(child))),
                  z: children.map((child) => parents.map((parent) => cosine(child.vector, parent.vector))),
                  zmin: -1,
                  zmax: 1,
                  colorscale: "RdBu",
                  reversescale: true,
                  hovertemplate: "%{customdata}<br>Mode: %{x}<br>Cosine: %{z:.4f}<extra></extra>",
                  colorbar: { title: { text: "Cosine" } },
                },
              ]
            : [];
        info = "Full-dimensional cosine: no projection loss. Parent averages include their own submodes; use sibling scores to check self-inclusion bias.";
      } else if (geometry.points.length) {
        const method = q<HTMLSelectElement>(root, ".proj").value as Projection3d;
        if (!projections.has(method))
          projections.set(
            method,
            project3d(
              geometry.points.map((p) => p.vector),
              method
            )
          );
        const projection = projections.get(method)!;
        axisRanges = [0, 1, 2].map((axis): [number, number] => {
          const values = projection.coords.map((p) => p[axis]);
          const min = Math.min(...values),
            max = Math.max(...values);
          const padding = (max - min) * 0.08 || 1;
          return [min - padding, max + padding];
        });
        info = projection.info;
        const index = new Map(geometry.points.map((p, i) => [p.id, i]));
        for (const name of Object.keys(store.modes!.data.modes)) {
          const group = visible.filter((p) => p.mode === name);
          for (const parent of [true, false]) {
            const members = group.filter((p) => (p.submode === null) === parent);
            if (!members.length) continue;
            const coords = members.map((p) => projection.coords[index.get(p.id)!]);
            traces.push({
              type: "scatter3d",
              name,
              showlegend: false,
              mode: parent ? "text+markers" : "markers",
              x: coords.map((p) => p[0]),
              y: coords.map((p) => p[1]),
              z: coords.map((p) => p[2]),
              // Plotly scatter3d has no triangle marker; camera-facing text preserves the requested shape.
              text: parent ? members.map(() => "▲") : undefined,
              textfont: { color: modeColor(name), size: members.some((p) => selectedIds.has(p.id)) ? 34 : 28 },
              customdata: members.map(
                (p) => [p.id, `<b>${esc(label(p))}</b>${p.weight !== null ? `<br>Weight: ${p.weight}` : ""}${p.issue ? "<br>Preview average" : ""}`]
              ),
              hovertemplate: "%{customdata[1]}<extra></extra>",
              marker: {
                symbol: "circle",
                size: members.map((p) => parent ? (selectedIds.has(p.id) ? 13 : 10) : selectedIds.has(p.id) ? 10 : p.weight === 0 ? 4 : 6),
                color: parent ? "rgba(0,0,0,0)" : modeColor(name),
                line: { color: members.map((p) => selectedIds.has(p.id) ? "#1f2933" : parent ? "rgba(0,0,0,0)" : modeColor(name)), width: 2 },
              },
            });
          }
        }
      }
      q(root, ".projection-info").textContent = `${visible.length}/${geometry.points.length} vectors visible. ${info}`;
      await Plotly.react(
        plot,
        traces,
        {
          uirevision: `${heatmap ? "heatmap" : q<HTMLSelectElement>(root, ".proj").value}`,
          margin: heatmap ? { l: 10, r: 10, t: 10, b: 40 } : { l: 0, r: 0, t: 0, b: 0 },
          scene: {
            xaxis: { title: { text: "" }, range: axisRanges?.[0] },
            yaxis: { title: { text: "" }, range: axisRanges?.[1] },
            zaxis: { title: { text: "" }, range: axisRanges?.[2] },
          },
          yaxis: {
            automargin: true,
            tickmode: heatmap ? "array" : "auto",
            tickvals: heatmap ? visible.filter((p) => p.submode !== null).map((p) => p.id) : undefined,
            ticktext: heatmap
              ? visible
                  .filter((p) => p.submode !== null)
                  .map((p) => {
                    const text = label(p);
                    return esc(text.length > 48 ? `${text.slice(0, 45)}...` : text);
                  })
              : undefined,
          },
          xaxis: { automargin: true },
          annotations: !traces.length
            ? [{ text: "No visible valid vectors. Show all or refresh missing embeddings.", showarrow: false, xref: "paper", yref: "paper", x: 0.5, y: 0.5 }]
            : [],
        },
        { responsive: true, displaylogo: false }
      );
      if (!heatmap && !plotEventsAttached && !disposed) {
        (plot as PlotlyHTMLElement).on("plotly_click", (event) => {
          const data = event.points[0]?.customdata;
          const id: unknown = Array.isArray(data) ? data[0] : undefined;
          if (typeof id !== "string" || !grid) return;
          const node = grid.getRowNode(id);
          if (!node) return;
          const mouse = (event as typeof event & { event?: MouseEvent }).event;
          // Scatter3d omits the mouse event and can emit repeated clicks during one press.
          if (plotGesture?.handled) return;
          const multiple = mouse ? mouse.ctrlKey || mouse.metaKey : plotGesture?.additive ?? false;
          if (plotGesture) plotGesture.handled = true;
          node.setSelected(multiple ? !node.isSelected() : true, !multiple);
          if (!q<HTMLElement>(root, ".vector-data").hidden) grid.ensureNodeVisible(node);
        });
        plotEventsAttached = true;
      }
    } catch (err) {
      if (!disposed) q(root, ".projection-info").textContent = `Unable to display vectors: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      drawing = false;
      if (disposed) Plotly.purge(plot);
      else if (queued) {
        queued = false;
        void draw();
      }
    }
  };
  if (heatmap) q(root, ".visibility").addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    const target = event.target;
    const names = Object.keys(store.modes!.data.modes);
    if (target.dataset.mode !== undefined) {
      const name = names[Number(target.dataset.mode)];
      if (target.checked) hiddenModes.delete(name);
      else hiddenModes.add(name);
    } else {
      const id = `${names[Number(target.dataset.parent)]}:${target.dataset.submode}`;
      if (target.checked) hiddenSubmodes.delete(id);
      else hiddenSubmodes.add(id);
    }
    controls();
    void draw();
  });
  root.querySelectorAll(".toolbar select").forEach((select) => select.addEventListener("change", () => void draw()));
  q(root, ".show-all").addEventListener("click", () => {
    hiddenModes.clear();
    hiddenSubmodes.clear();
    if (grid) {
      q<HTMLSelectElement>(root, ".filter-mode").value = "";
      q<HTMLSelectElement>(root, ".filter-submode").value = "";
      q<HTMLInputElement>(root, ".filter-search").value = "";
      grid.setGridOption("quickFilterText", "");
      grid.setFilterModel(null);
      grid.onFilterChanged();
    }
    controls();
    void draw();
  });
  const refresh = () => {
    geometry = modeGeometry(store.modes!.data);
    projections = new Map();
    controls();
    grid?.setGridOption("rowData", gridRows());
    grid?.onFilterChanged();
    void draw();
  };
  store.addEventListener("modes", refresh);
  const resize = new ResizeObserver(() => {
    if (!disposed && (plot as PlotlyHTMLElement).data) Plotly.Plots.resize(plot);
  });
  resize.observe(plot);
  controls();
  if (!heatmap) {
    grid = createGrid<VectorRow>(q(root, ".vector-grid"), {
      rowData: gridRows(),
      getRowId: (p) => p.data.id,
      domLayout: "autoHeight",
      defaultColDef: { filter: true, floatingFilter: true, sortable: true, resizable: true, flex: 1, minWidth: 105 },
      rowSelection: { mode: "multiRow", enableClickSelection: true },
      columnDefs: [
        { field: "mode", filter: "agTextColumnFilter", cellStyle: (p) => ({ color: modeColor(p.value) }) },
        { field: "type", filter: "agTextColumnFilter" },
        { field: "text", headerName: "Submode / mode text", filter: "agTextColumnFilter", flex: 3, minWidth: 250, wrapText: true, autoHeight: true },
        { field: "weight", filter: "agNumberColumnFilter" },
        ...(["parentCosine", "siblingCosine", "gap"] as const).map((field) => ({
          field, filter: "agNumberColumnFilter", valueFormatter: (p: { value: number | null }) => score(p.value),
        })),
        { field: "rival", filter: "agTextColumnFilter" },
      ],
      isExternalFilterPresent: () => !!(q<HTMLSelectElement>(root, ".filter-mode").value || q<HTMLSelectElement>(root, ".filter-submode").value),
      doesExternalFilterPass: (node) => {
        if (!node.data) return false;
        const mode = q<HTMLSelectElement>(root, ".filter-mode").value;
        const submode = q<HTMLSelectElement>(root, ".filter-submode").value;
        const child = geometry.points.find((p) => p.id === submode);
        return (!mode || node.data.mode === mode) &&
          (!submode || node.data.id === submode || (node.data.type === "Mode" && node.data.mode === child?.mode));
      },
      onFilterChanged: () => { void draw(); },
      onSelectionChanged: (event) => {
        selectedIds.clear();
        event.api.getSelectedRows().forEach((row) => selectedIds.add(row.id));
        void draw();
      },
    });
    q(root, ".filter-mode").addEventListener("change", () => { updateSubmodeChoices(); grid!.onFilterChanged(); });
    q(root, ".filter-submode").addEventListener("change", () => grid!.onFilterChanged());
    q<HTMLInputElement>(root, ".filter-search").addEventListener("input", (event) =>
      grid!.setGridOption("quickFilterText", (event.target as HTMLInputElement).value));
    q<HTMLInputElement>(root, ".show-data").addEventListener("change", (event) => {
      q<HTMLElement>(root, ".vector-data").hidden = !(event.target as HTMLInputElement).checked;
    });
  }
  void draw();
  return () => {
    disposed = true;
    resize.disconnect();
    store.removeEventListener("modes", refresh);
    grid?.destroy();
    plot.removeEventListener("pointerdown", beginPlotGesture, true);
    root.classList.remove("mode-grid-page");
    if (!drawing) Plotly.purge(plot);
  };
}
