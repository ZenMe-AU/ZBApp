/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

export const modeHelp = `
  <p>Triangles are current weighted mode averages; circles are independently embedded submodes. Colours group each parent with its submodes. Zero-weight submodes are visible with smaller circles but do not affect averages.</p>
  <p>Averages are derived offline from the current draft. Nothing is saved. Missing/stale embeddings are listed, not fabricated. A parent whose saved average needs recalculation is marked “preview average”.</p>
  <h4>Projection versus alignment</h4>
  <p>UMAP (cosine, seed 42) and t-SNE (unit-normalized Euclidean, seed 42) highlight local neighbourhoods; global distances and apparent outliers can be misleading. t-SNE uses 500 iterations and adapts perplexity to the number of points. PCA is linear and reports retained variance. All projections use all valid points; hiding points does not refit or move the layout.</p>
  <p>Modes → Heatmap is a separate page for full-dimensional comparison. It compares each submode with every mode average and includes the alignment table. Hover for the exact cosine.</p>
  <p><b>Sibling cosine</b> compares a submode with the weighted parent average <em>excluding itself</em>, reducing self-inclusion bias. <b>Parent cosine</b> includes itself. <b>Rival</b> is its nearest other parent (including hidden modes); <b>gap</b> = sibling cosine − rival cosine. A negative gap suggests cross-mode ambiguity, not proof of incorrect wording. The table is sorted by weakest sibling alignment.</p>
  <h4>Testing alternative wording</h4>
  <p>Compare “attend” with “attend gallery” and “attend venue” as separately embedded submodes. Add candidates at weight zero in Modes → Edit, Save and Refresh embeddings; they can be evaluated without moving the parent average. Refresh automatically recalculates averages. Use sibling cosine, rival gap and keyword scores before assigning weight. Each submode's definition is embedded.</p>
  <p>On 3D, rotate by dragging; normal wheel scrolls the page and Ctrl+wheel zooms. Hover over a point to see its definition in the bottom-right detail box. The filter panel applies to both the plot and supporting grid; grid column filters work the same way. Show data reveals the grid below the plot. Clear filters restores all points.</p>
  <p>Click a point to select its grid row; Ctrl-click (or Command-click) toggles additional selections. Selecting grid rows highlights the same points. Filtering does not clear selection; selected points hidden by filters reappear highlighted when shown again.</p>
  <p>On Heatmap, mode checkboxes hide/show whole groups; submode choices are retained while their parent is hidden. Show all restores every point.</p>`;
