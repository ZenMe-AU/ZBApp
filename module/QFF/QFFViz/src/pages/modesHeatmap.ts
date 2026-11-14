/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import Plotly, { type Data, type PlotlyHTMLElement } from "plotly.js-dist-min";
import { store } from "../data/store";
import { esc, openInfo, q } from "../shared/dom";
import { modeColor } from "../shared/modes";
import { cosine } from "../shared/cosine";
import { modeGeometry, visibleModePoints, type ModePoint } from "../shared/modeGeometry";
import { modeHelp } from "../shared/modeHelp";

const score = (value: number | null | undefined) => (value == null ? "—" : value.toFixed(3));
const label = (p: ModePoint) => (p.submode === null ? `${p.mode} (mode)` : `${p.mode} / ${p.text}`);

export function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="toolbar">
      <h2>Modes: Heatmap <button class="info-btn" aria-label="How to read mode heatmap">ⓘ</button></h2>
      <button class="show-all">Show all</button>
    </div>
    <p class="hint projection-info" role="status"></p>
    <div class="split mode-vectors">
      <div class="plot"></div>
      <aside class="panel"><div class="vector-warnings"></div><h3>Visibility</h3><div class="visibility"></div><h3>Full-dimensional alignment</h3><p class="hint">Weakest sibling cosine first. Negative gap: closer to another mode. Hover scores for details.</p><div class="alignment"></div></aside>
    </div>`;
  q(root, ".info-btn").addEventListener("click", () => openInfo("Mode heatmap and outliers", modeHelp));
  const plot = q(root, ".plot");
  let geometry = modeGeometry(store.modes!.data);
  const hiddenModes = new Set<string>();
  const hiddenSubmodes = new Set<string>();
  let disposed = false;
  let drawing = false;
  let queued = false;
  const controls = () => {
    q(root, ".visibility").innerHTML = Object.entries(store.modes!.data.modes)
      .map(([name, mode], index) => `
      <details open>
        <summary><label style="color:${modeColor(name)}"><input type="checkbox" data-mode="${index}" ${hiddenModes.has(name) ? "" : "checked"} /> ${esc(name)}</label></summary>
        ${mode.submodes.map((submode, i) => {
          const id = `${name}:${i}`;
          const available = geometry.points.some(p => p.id === id);
          return `<label class="submode-toggle" title="${esc(submode.text)}"><input type="checkbox" data-parent="${index}" data-submode="${i}"
            ${hiddenSubmodes.has(id) ? "" : "checked"} ${hiddenModes.has(name) || !available ? "disabled" : ""} />
            <span style="color:${modeColor(name)}">●</span> ${esc(submode.text)}${available ? "" : " (embedding unavailable)"}${submode.weight === 0 ? " (weight 0)" : ""}</label>`;
        }).join("")}
      </details>`).join("");
    const preview = geometry.points.filter(p => p.submode === null && p.issue).map(p => p.mode);
    const warnings = q<HTMLElement>(root, ".vector-warnings");
    warnings.innerHTML = `
      ${store.areModesDirty ? "<p class=\"hint\">Showing unsaved mode draft.</p>" : ""}
      ${preview.length ? `<p class="hint">Preview averages: ${esc(preview.join(", "))}. Recalculate in Edit to persist.</p>` : ""}
      ${geometry.warnings.length ? `<details open><summary class="mode-error">Unavailable vectors (${geometry.warnings.length})</summary><ul>${geometry.warnings.map(w => `<li>${esc(w)}</li>`).join("")}</ul></details>` : ""}`;
    warnings.hidden = !store.areModesDirty && !preview.length && !geometry.warnings.length;
  };
  const draw = async () => {
    if (disposed) return;
    if (drawing) {
      queued = true;
      return;
    }
    drawing = true;
    try {
      const visible = visibleModePoints(geometry.points, hiddenModes, hiddenSubmodes);
      const visibleIds = new Set(visible.map(p => p.id));
      const rows = geometry.alignment.filter(a => visibleIds.has(a.point.id));
      q(root, ".alignment").innerHTML
        = `<table class="mini"><thead><tr><th>Submode</th><th>Parent</th><th>Sibling</th><th>Rival</th><th>Gap</th></tr></thead><tbody>${rows.map(a => `
        <tr><td style="color:${modeColor(a.point.mode)}">${esc(label(a.point))}</td>
        <td title="Cosine to parent including this submode">${score(a.parentScore)}</td>
        <td title="${esc(a.siblingIssue ?? "Cosine to parent excluding this submode")}">${score(a.siblingScore)}</td>
        <td title="Cosine ${score(a.rival?.score)}">${esc(a.rival?.mode ?? "—")}</td>
        <td class="${a.margin !== null && a.margin < 0 ? "mode-error" : ""}" title="Sibling cosine minus rival cosine">${score(a.margin)}</td></tr>`).join("")}</tbody></table>`;
      const parents = visible.filter(p => p.submode === null);
      const children = visible.filter(p => p.submode !== null);
      const traces: Data[] = parents.length && children.length
        ? [{
            type: "heatmap",
            x: parents.map(p => p.mode),
            y: children.map(p => p.id),
            customdata: children.map(child => parents.map(() => label(child))),
            z: children.map(child => parents.map(parent => cosine(child.vector, parent.vector))),
            zmin: -1,
            zmax: 1,
            colorscale: "RdBu",
            reversescale: true,
            hovertemplate: "%{customdata}<br>Mode: %{x}<br>Cosine: %{z:.4f}<extra></extra>",
            colorbar: { title: { text: "Cosine" } },
          }]
        : [];
      q(root, ".projection-info").textContent = `${visible.length}/${geometry.points.length} vectors visible. Full-dimensional cosine: no projection loss. Parent averages include their own submodes; use sibling scores to check self-inclusion bias.`;
      await Plotly.react(plot, traces, {
        uirevision: "heatmap",
        margin: { l: 10, r: 10, t: 10, b: 40 },
        scene: {
          xaxis: { title: { text: "" }, spikecolor: "rgba(0,0,0,0.2)" },
          yaxis: { title: { text: "" }, spikecolor: "rgba(0,0,0,0.2)" },
          zaxis: { title: { text: "" }, spikecolor: "rgba(0,0,0,0.2)" },
        },
        yaxis: {
          automargin: true,
          tickmode: "array",
          tickvals: children.map(p => p.id),
          ticktext: children.map((p) => {
            const text = label(p);
            return esc(text.length > 48 ? `${text.slice(0, 45)}...` : text);
          }),
        },
        xaxis: { automargin: true },
        annotations: !traces.length ? [{ text: "No visible valid vectors. Show all or refresh missing embeddings.", showarrow: false, xref: "paper", yref: "paper", x: 0.5, y: 0.5 }] : [],
      }, { responsive: true, displaylogo: false, scrollZoom: false });
    }
    catch (err) {
      if (!disposed) q(root, ".projection-info").textContent = `Unable to display vectors: ${err instanceof Error ? err.message : String(err)}`;
    }
    finally {
      drawing = false;
      if (disposed) Plotly.purge(plot);
      else if (queued) {
        queued = false;
        void draw();
      }
    }
  };
  q(root, ".visibility").addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    const target = event.target;
    const names = Object.keys(store.modes!.data.modes);
    if (target.dataset.mode !== undefined) {
      const name = names[Number(target.dataset.mode)];
      if (target.checked) hiddenModes.delete(name);
      else hiddenModes.add(name);
    }
    else {
      const id = `${names[Number(target.dataset.parent)]}:${target.dataset.submode}`;
      if (target.checked) hiddenSubmodes.delete(id);
      else hiddenSubmodes.add(id);
    }
    controls();
    void draw();
  });
  q(root, ".show-all").addEventListener("click", () => {
    hiddenModes.clear();
    hiddenSubmodes.clear();
    controls();
    void draw();
  });
  const refresh = () => {
    geometry = modeGeometry(store.modes!.data);
    controls();
    void draw();
  };
  store.addEventListener("modes", refresh);
  const resize = new ResizeObserver(() => {
    if (!disposed && (plot as PlotlyHTMLElement).data) Plotly.Plots.resize(plot);
  });
  resize.observe(plot);
  controls();
  void draw();
  return () => {
    disposed = true;
    resize.disconnect();
    store.removeEventListener("modes", refresh);
    if (!drawing) Plotly.purge(plot);
  };
}
