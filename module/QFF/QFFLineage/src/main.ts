/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { baselineProducer, columnLineageLines, dependencyGraph, displaySchemaField, edgeKey, entityKey, namespaceLayout, readLineage, type ColumnLineage, type Entity, type LineageNode, type Mapping, type Run, type SchemaField } from "./lineage.ts";
import "./style.css";

const files = import.meta.glob<string>("../events/**/*.json", { eager: true, query: "?raw", import: "default" });
const { jobs, datasets, errors, schemas, declared } = readLineage(files);
const graph = dependencyGraph(jobs, datasets.values(), declared);
const mappingByDestination = new Map(declared.map(mapping => [entityKey(mapping.destination), mapping]));
const viewport = document.querySelector<HTMLElement>("#viewport")!;
const inspect = document.querySelector<HTMLElement>("#inspect")!;
const panel = document.querySelector<HTMLElement>("#details-panel")!;
const panelGrip = document.querySelector<HTMLButtonElement>("#details-resize")!;
const warnings = document.querySelector<HTMLElement>("#errors")!;
let selected: HTMLButtonElement | undefined;
const label = (entity: Entity) => `${entity.namespace} / ${entity.name}`;
const operationLabel = (operation: "query" | "command") => operation === "query" ? "Query" : "Command";
const schemaLabel = (fields: SchemaField[] | undefined) => fields ? "No fields recorded" : "Schema not recorded";
const isBaseline = (run: Run) => run.sources.some(({ event }) => event.producer === baselineProducer);

function text(tag: string, content: string) {
  const element = document.createElement(tag);
  element.textContent = content;
  return element;
}

const svg = <K extends keyof SVGElementTagNameMap>(tag: K) =>
  document.createElementNS("http://www.w3.org/2000/svg", tag);

function fieldList(fields: SchemaField[], showDescriptions = false) {
  const list = document.createElement("span");
  list.className = "schema-fields";
  list.setAttribute("role", "list");
  for (const field of fields) {
    const { label, children } = displaySchemaField(field);
    const item = text("span", showDescriptions && field.description ? `${label} — ${field.description}` : label);
    item.setAttribute("role", "listitem");
    if (children?.length) item.append(fieldList(children, showDescriptions));
    list.append(item);
  }
  return list;
}

function resizeWith(grip: HTMLButtonElement, target: HTMLElement, direction: 1 | -1, resize: (width: number) => void) {
  grip.setAttribute("aria-description", "Use the Left and Right arrow keys to resize.");
  let drag: { x: number, width: number } | undefined;
  grip.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) return;
    drag = { x: event.clientX, width: target.offsetWidth };
    grip.setPointerCapture(event.pointerId);
  });
  grip.addEventListener("pointermove", event => {
    if (drag && grip.hasPointerCapture(event.pointerId)) resize(drag.width + direction * (event.clientX - drag.x));
  });
  grip.addEventListener("lostpointercapture", () => { drag = undefined; });
  grip.addEventListener("keydown", event => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    resize(target.offsetWidth + direction * (event.key === "ArrowRight" ? 16 : -16));
  });
}

resizeWith(panelGrip, panel, -1, width => {
  panel.style.width = `${Math.max(240, width)}px`;
});
function renderGraph() {
  const { groups, placeholders, edges } = namespaceLayout(graph);
  const cardWidth = 184, minWidth = 40, maxWidth = 560, columnGap = 42, gap = 20, padding = 24;
  const stage = document.createElement("div");
  stage.className = "stage";
  viewport.replaceChildren();
  if (groups.length) viewport.append(stage);

  function makeCard(node: LineageNode) {
    const { id, kind, entity } = node;
    const frame = document.createElement("div");
    frame.className = "node-frame";
    frame.style.width = `${cardWidth}px`;
    const card = document.createElement("button");
    card.className = `node ${kind}`;
    card.setAttribute("aria-pressed", "false");
    card.setAttribute("aria-label", kind === "job" ? `Job: ${label(entity)}` : label(entity));
    card.title = label(entity);
    const definition = kind === "job" ? jobs.get(entityKey(entity))?.definition : undefined;
    const heading = definition?.operation ? operationLabel(definition.operation) : "Job";
    card.append(text("small", kind === "job" ? `${heading} · ${entity.namespace}` : entity.namespace), text("strong", entity.name));
    if (kind === "dataset") {
      const fields = schemas.get(entityKey(entity))?.fields;
      const list = document.createElement("span");
      list.className = "node-content";
      list.append(fields?.length ? fieldList(fields) : text("span", schemaLabel(fields)));
      card.append(list);
    } else {
      const entities = (ids?: Set<string>) => [...ids ?? []].map(id => graph.nodes.get(id)!.entity);
      const sections: [string, string[]][] = [
        ["Inputs", entities(graph.upstream.get(id)).map(entity => entity.name)],
        ["Outputs", entities(graph.downstream.get(id)).map(entity => entity.name)],
      ];
      if (definition?.description) sections.push(["Documentation", definition.description.split("\n")]);
      for (const [title, items] of sections) {
        const list = document.createElement("span");
        list.className = "node-content node-actions";
        list.append(text("b", title), ...(items.length ? items : ["None recorded"]).map(item => text("span", item)));
        card.append(list);
      }
      card.setAttribute("aria-description", [heading, ...sections.map(([title, items]) =>
        `${title}: ${items.join("; ") || "None recorded"}`)].join(". "));
    }
    card.addEventListener("click", () => {
      selected?.setAttribute("aria-pressed", "false");
      selected = card;
      card.setAttribute("aria-pressed", "true");
      highlightConnections(id);
      showDetails(node);
    });
    const grip = document.createElement("button");
    grip.className = "resize-strip node-resize";
    grip.setAttribute("aria-label", `Resize ${label(entity)}`);
    resizeWith(grip, frame, 1, width => {
      frame.style.width = `${Math.max(minWidth, Math.min(maxWidth, width))}px`;
      layout();
    });
    frame.append(card, grip);
    return { id, frame };
  }

  const sections = groups.map(({ namespace, lanes }) => {
    const section = document.createElement("section");
    section.className = "namespace-group";
    section.setAttribute("aria-label", namespace);
    section.append(text("h2", namespace));
    const columns = Object.entries(lanes).filter(([, nodes]) => nodes.length).map(([lane, nodes]) => {
      const cards = nodes.map(makeCard);
      for (const { frame } of cards) {
        frame.dataset.lane = lane;
        section.append(frame);
      }
      return cards;
    });
    stage.append(section);
    return { section, columns };
  });
  if (placeholders.length) {
    const section = document.createElement("section");
    section.className = "namespace-placeholders";
    const cards = document.createElement("div");
    cards.append(...placeholders.map(node => makeCard(node).frame));
    section.append(text("h2", "Namespaces without recorded datasets"), cards);
    viewport.append(section);
  }

  const lines = svg("svg");
  lines.setAttribute("aria-hidden", "true");
  const frontLines = svg("svg");
  frontLines.classList.add("front-lines");
  frontLines.setAttribute("aria-hidden", "true");
  const defs = svg("defs");
  const arrow = svg("marker");
  arrow.id = "arrow";
  arrow.setAttribute("viewBox", "0 0 8 8");
  arrow.setAttribute("markerUnits", "userSpaceOnUse");
  arrow.setAttribute("markerWidth", "10.5");
  arrow.setAttribute("markerHeight", "10.5");
  arrow.setAttribute("refX", "8");
  arrow.setAttribute("refY", "4");
  arrow.setAttribute("orient", "auto");
  const tip = svg("path");
  tip.setAttribute("d", "M0 0 L8 4 L0 8 Z");
  arrow.append(tip);
  const outline = svg("filter");
  outline.id = "connection-outline";
  outline.setAttribute("color-interpolation-filters", "sRGB");
  outline.setAttribute("filterUnits", "userSpaceOnUse");
  outline.setAttribute("x", "0");
  outline.setAttribute("y", "0");
  outline.setAttribute("width", "100%");
  outline.setAttribute("height", "100%");
  const expand = svg("feMorphology");
  expand.setAttribute("in", "SourceAlpha");
  expand.setAttribute("operator", "dilate");
  expand.setAttribute("radius", "1");
  expand.setAttribute("result", "expanded");
  const tint = svg("feFlood");
  const mask = svg("feComposite");
  mask.setAttribute("in2", "expanded");
  mask.setAttribute("operator", "in");
  const paint = svg("feComposite");
  paint.setAttribute("in", "SourceGraphic");
  paint.setAttribute("operator", "over");
  outline.append(expand, tint, mask, paint);
  defs.append(arrow, outline);
  const basePaths = svg("g");
  const hitPaths = svg("g");
  lines.append(defs, basePaths, hitPaths);
  const paths = edges.map(edge => {
    const path = svg("path");
    path.classList.add("connection");
    path.setAttribute("marker-end", "url(#arrow)");
    if (graph.declaredEdges.has(edgeKey(edge.from, edge.to))) {
      path.setAttribute("stroke-dasharray", "5 4");
    }
    const hit = svg("path");
    hit.classList.add("connection-hit");
    const connection = { ...edge, path, hit, raised: false };
    hit.addEventListener("pointerenter", () => {
      connection.raised = true;
      frontLines.append(path);
      path.classList.add("is-hovered");
    });
    hit.addEventListener("pointerleave", () => path.classList.remove("is-hovered"));
    basePaths.append(path);
    hitPaths.append(hit);
    return connection;
  });
  stage.prepend(lines);
  stage.append(frontLines);

  function highlightConnections(id?: string) {
    for (const { from, to, path, raised } of paths) {
      const connected = from === id || to === id;
      path.classList.toggle("is-connected", connected);
      if (connected && !raised) frontLines.append(path);
      if (!connected && !raised && path.parentNode === frontLines) basePaths.append(path);
    }
  }

  document.querySelector("#details-close")!.addEventListener("click", () => {
    panel.hidden = true;
    selected?.setAttribute("aria-pressed", "false");
    selected?.focus({ preventScroll: true });
    selected = undefined;
    highlightConnections();
  });

  function layout() {
    if (!sections.length) return;
    const columns = sections.flatMap(({ columns }) => columns);
    const byNode = new Map(columns.flatMap((cards, index) => cards.map(({ id }) => [id, index] as const)));
    const routes = paths.map(({ from, to, path, hit }) => ({ path, hit, from, to, delta: byNode.get(to)! - byNode.get(from)! }));
    const sectionTop = padding + 6 * routes.filter(({ delta }) => Math.abs(delta) > 1).length;
    const positions = new Map<string, { left: number, right: number, y: number, columnLeft: number, columnRight: number }>();
    let x = padding;
    let height = 280;
    for (const { section, columns } of sections) {
      const start = x;
      const widths = columns.map(cards => Math.max(cardWidth, ...cards.map(({ frame }) => frame.offsetWidth)));
      section.style.width = `${widths.reduce((sum, width) => sum + width, 24) + (widths.length - 1) * columnGap}px`;
      const header = section.querySelector("h2")!;
      let sectionHeight = 0;
      for (const [index, cards] of columns.entries()) {
        const columnWidth = widths[index];
        let y = header.offsetHeight + 20;
        for (const { id, frame } of cards) {
          frame.style.left = `${x - start + 11}px`;
          frame.style.top = `${y}px`;
          positions.set(id, {
            left: x + 12, right: x + 12 + frame.offsetWidth, y: sectionTop + 1 + y + frame.offsetHeight / 2,
            columnLeft: x + 12, columnRight: x + 12 + columnWidth,
          });
          y += frame.offsetHeight + gap;
        }
        sectionHeight = Math.max(sectionHeight, y);
        x += columnWidth + columnGap;
      }
      section.style.left = `${start}px`;
      section.style.top = `${sectionTop}px`;
      section.style.height = `${sectionHeight}px`;
      height = Math.max(height, sectionTop + sectionHeight + padding);
      x += 24;
    }
    const width = x - columnGap + padding;
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    for (const layer of [lines, frontLines]) {
      layer.setAttribute("width", String(width));
      layer.setAttribute("height", String(height));
    }
    // ponytail: long links use overhead tracks; use obstacle-aware routing if dense graphs need it.
    let track = 12;
    for (const { from, to, path, hit, delta } of routes) {
      const a = positions.get(from)!;
      const b = positions.get(to)!;
      const rightward = delta > 0;
      const ay = a.y + (rightward ? -7 : 7);
      const by = b.y + (rightward ? -7 : 7);
      const exit = rightward || !delta ? a.right : a.left;
      const entry = rightward ? b.left : b.right;
      const route = !delta
        ? `M${exit} ${a.y - 7} H${a.columnRight + (a.y < b.y ? 12 : 20)} V${by} H${entry}`
        : Math.abs(delta) === 1
          ? `M${exit} ${ay} H${rightward ? a.columnRight + 12 : a.columnLeft - 12} V${by} H${entry}`
          : `M${exit} ${ay} H${rightward ? a.columnRight + 12 : a.columnLeft - 12} V${track += 6} H${rightward ? b.columnLeft - 20 : b.columnRight + 20} V${by} H${entry}`;
      path.setAttribute("d", route);
      hit.setAttribute("d", route);
    }
  }
  layout();
}

function last(run: Run) {
  return run.sources[run.sources.length - 1].event;
}

function showMapping(mapping: Mapping) {
  if (mapping.resolveIdentity) {
    inspect.append(text("p", "external_id resolves to identity_id (same value in fixture mode). The internal ID selects the target files."));
  }
  if (mapping.mapping === "flatten-by-kind") {
    for (const [group, kind] of Object.entries(mapping.kindByGroup)) {
      inspect.append(text("p", `preferences.${group}[] → preferences[].kind = "${kind}"`));
    }
  }
}

function showColumnLineage(lineages: ColumnLineage[]) {
  for (const lineage of lineages) {
    const lines = columnLineageLines(lineage);
    if (!lines.length) continue;
    const list = document.createElement("ul");
    list.append(...lines.map(line => text("li", line)));
    inspect.append(text("h3", `Column lineage: ${label(lineage.dataset)}`), list);
  }
}

function showDetails(node: LineageNode) {
  panel.hidden = false;
  inspect.scrollTop = 0;
  inspect.replaceChildren(text("h2", label(node.entity)));
  if (node.kind === "dataset") {
    const fields = schemas.get(entityKey(node.entity))?.fields;
    inspect.append(text("h3", "Schema"), fields?.length ? fieldList(fields, true) : text("p", schemaLabel(fields)));
    // Job column lineage and a dataset's declared mapping may overlap; both are shown for the designer to reconcile.
    showColumnLineage([...jobs.values()].flatMap(({ definition }) =>
      definition?.columnLineage.filter(({ dataset }) => entityKey(dataset) === entityKey(node.entity)) ?? []));
    for (const [title, adjacency] of [["Produced by", graph.upstream], ["Consumed by", graph.downstream]] as const) {
      const neighbors = [...(adjacency.get(node.id) ?? [])].map(id => graph.nodes.get(id)!);
      const names = neighbors.filter(neighbor => neighbor.kind === "job").map(neighbor => {
        const [from, to] = adjacency === graph.upstream ? [neighbor.id, node.id] : [node.id, neighbor.id];
        return label(neighbor.entity) + (graph.declaredEdges.has(edgeKey(from, to)) ? " (declared)" : "");
      });
      inspect.append(text("p", `${title}: ${names.join(", ") || "None recorded"}`));
      for (const neighbor of neighbors.filter(neighbor => neighbor.kind === "dataset")) {
        const incoming = adjacency === graph.upstream;
        const mapping = mappingByDestination.get(entityKey(incoming ? node.entity : neighbor.entity))!;
        const direction = incoming ? "from" : "to";
        const kind = mapping.mapping === "flatten-by-kind" ? "preference groups to kinds"
          : mapping.resolveIdentity ? "field copy with identity resolution" : "direct copy";
        inspect.append(text("p", `Declared ${kind} ${direction}: ${label(neighbor.entity)}`));
        showMapping(mapping);
      }
    }
    return;
  }
  const job = jobs.get(entityKey(node.entity))!;
  if (job.definition) {
    const { event, description, columnLineage, operation } = job.definition;
    inspect.append(text("h3", operation ? `Declared ${operation}` : "Declared job"), text("p", "Planned lineage, not runtime telemetry."));
    if (description) {
      const list = document.createElement("ul");
      list.append(...description.split("\n").map(line => text("li", line)));
      inspect.append(text("h3", "Documentation"), list);
    }
    showColumnLineage(columnLineage);
    for (const [title, entities] of [["Inputs", event.inputs], ["Outputs", event.outputs]] as const) {
      inspect.append(text("p", `${title}: ${entities?.map(label).join(", ") || "None recorded"}`));
    }
  }
  if (!job.runs.size) {
    inspect.append(text("p", "No runs recorded."));
    return;
  }
  const runs = [...job.runs.values()].sort((a, b) => Date.parse(last(b).eventTime) - Date.parse(last(a).eventTime));
  const picker = document.createElement("select");
  for (const run of runs) picker.add(new Option(`${last(run).eventTime} · ${last(run).eventType} · ${run.id}`, run.id));
  const field = text("label", "Run ");
  field.append(picker);
  const detail = document.createElement("div");
  inspect.append(field, detail);

  function showRun() {
    const run = job.runs.get(picker.value)!;
    detail.replaceChildren(...([["Inputs", run.inputs], ["Outputs", run.outputs]] as const).map(([title, entities]) =>
      text("p", `${title}: ${entities.map(label).join(", ") || "None recorded"}`)));
    if (isBaseline(run)) detail.prepend(text("p", "Initial baseline capture — repository snapshot, not runtime telemetry."));
    detail.append(text("h3", "Source events"));
    for (const { path, event, raw } of run.sources) {
      const eventDetails = document.createElement("details");
      eventDetails.append(text("summary", `${event.eventType} — ${event.eventTime} — ${path}`), text("pre", raw));
      detail.append(eventDetails);
    }
  }
  picker.addEventListener("change", showRun);
  showRun();
}

if (errors.length) {
  warnings.hidden = false;
  warnings.append(text("h2", "Lineage load warnings"), ...errors.map(error => text("p", error)));
}
if (graph.nodes.size) {
  renderGraph();
} else {
  viewport.append(text("p", "No OpenLineage datasets or jobs to display. Add a DatasetEvent, JobEvent, or RunEvent JSON file under events/."));
}
