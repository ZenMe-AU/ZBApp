/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { baselineProducer, dependencyGraph, displaySchemaField, edgeKey, entityKey, graphLayout, readLineage, type Entity, type LineageNode, type Mapping, type Run, type SchemaField } from "./lineage.ts";
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
document.querySelector("#details-close")!.addEventListener("click", () => {
  panel.hidden = true;
  selected?.setAttribute("aria-pressed", "false");
  selected?.focus({ preventScroll: true });
  selected = undefined;
});

function renderGraph() {
  const { layers, edges } = graphLayout(graph);
  const hasRuns = [...jobs.values()].some(job => job.runs.size > 0);
  const columns = new Map<number, LineageNode[]>();
  const standalone: LineageNode[] = [];
  for (const [id, layer] of layers) {
    const node = graph.nodes.get(id)!;
    if (!hasRuns && !graph.upstream.has(id) && !graph.downstream.has(id)) {
      standalone.push(node);
      continue;
    }
    const column = columns.get(layer) ?? [];
    column.push(node);
    columns.set(layer, column);
  }
  if (standalone.length) {
    standalone.sort((a, b) => label(a.entity).localeCompare(label(b.entity)));
    const rows = Math.ceil(standalone.length / 5);
    const start = Math.max(-1, ...columns.keys()) + 1;
    for (let i = 0; i < standalone.length; i += rows) columns.set(start + i, standalone.slice(i, i + rows));
  }
  const ordered = [...columns].sort(([a], [b]) => a - b);
  const cardWidth = 184, minWidth = 40, maxWidth = 560, columnGap = 42, gap = 20, padding = 24;
  const stage = document.createElement("div");
  stage.className = "stage";
  viewport.replaceChildren(stage);

  // ponytail: fixed columns; switch layout engines if dense graphs need obstacle avoidance.
  const cards = ordered.map(([, column]) => {
    column.sort((a, b) => label(a.entity).localeCompare(label(b.entity)));
    return column.map(node => {
      const { id, kind, entity } = node;
      const frame = document.createElement("div");
      frame.className = "node-frame";
      frame.style.width = `${cardWidth}px`;
      const card = document.createElement("button");
      card.className = `node ${kind}`;
      card.setAttribute("aria-pressed", "false");
      card.setAttribute("aria-label", kind === "job" ? `Job: ${label(entity)}` : label(entity));
      card.title = label(entity);
      card.append(text("small", kind === "job" ? `job · ${entity.namespace}` : entity.namespace), text("strong", entity.name));
      if (kind === "dataset") {
        const fields = schemas.get(entityKey(entity))?.fields;
        const list = document.createElement("span");
        list.className = "node-content";
        list.append(fields?.length ? fieldList(fields) : text("span", schemaLabel(fields)));
        card.append(list);
      } else {
        const actions = jobs.get(entityKey(entity))?.definition?.actions;
        if (actions?.length) {
          const list = document.createElement("span");
          list.className = "node-content node-actions";
          list.append(...actions.map(action => text("span", action)));
          card.setAttribute("aria-description", `Actions: ${actions.join("; ")}`);
          card.append(list);
        }
      }
      card.addEventListener("click", () => {
        selected?.setAttribute("aria-pressed", "false");
        selected = card;
        card.setAttribute("aria-pressed", "true");
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
      stage.append(frame);
      return { id, frame };
    });
  });

  const lines = svg("svg");
  lines.setAttribute("aria-hidden", "true");
  const defs = svg("defs");
  const arrow = svg("marker");
  arrow.id = "arrow";
  arrow.setAttribute("viewBox", "0 0 8 8");
  arrow.setAttribute("markerWidth", "7");
  arrow.setAttribute("markerHeight", "7");
  arrow.setAttribute("refX", "8");
  arrow.setAttribute("refY", "4");
  arrow.setAttribute("orient", "auto");
  const tip = svg("path");
  tip.setAttribute("d", "M0 0 L8 4 L0 8 Z");
  arrow.append(tip);
  defs.append(arrow);
  lines.append(defs);
  const paths = edges.map(edge => {
    const path = svg("path");
    path.setAttribute("marker-end", "url(#arrow)");
    if (graph.declaredEdges.has(edgeKey(edge.from, edge.to))) {
      path.setAttribute("stroke-dasharray", "5 4");
    }
    lines.append(path);
    return { ...edge, path };
  });
  stage.prepend(lines);

  function layout() {
    const measured = cards.map(column => column.map(item => ({
      ...item, width: item.frame.offsetWidth, height: item.frame.offsetHeight,
    })));
    const widths = measured.map(column => Math.max(...column.map(item => item.width)));
    const heights = measured.map(column => column.reduce((sum, item) => sum + item.height, 0) + gap * (column.length - 1));
    const width = padding * 2 + widths.reduce((sum, value) => sum + value, 0) + columnGap * (widths.length - 1);
    const height = Math.max(280, padding * 2 + Math.max(...heights));
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    lines.setAttribute("width", String(width));
    lines.setAttribute("height", String(height));
    const positions = new Map<string, { x: number, y: number, right: number, column: number }>();
    let x = padding;
    measured.forEach((column, index) => {
      let top = hasRuns ? (height - heights[index]) / 2 : padding;
      for (const { id, frame, width, height } of column) {
        frame.style.left = `${x}px`;
        frame.style.top = `${top}px`;
        positions.set(id, { x, y: top + height / 2, right: x + width, column: index });
        top += height + gap;
      }
      x += widths[index] + columnGap;
    });
    for (const { from, to, path } of paths) {
      const a = positions.get(from)!;
      const b = positions.get(to)!;
      const bend = a.x + widths[a.column] + columnGap / 2;
      const route = b.column === a.column + 1
        ? `M${a.right} ${a.y} C${bend} ${a.y} ${bend} ${b.y} ${b.x} ${b.y}`
        : a.column === b.column ? `M${a.right} ${a.y} H${bend} V${b.y} H${b.right}`
        : `M${a.right} ${a.y} H${bend} V14 H${b.x - 18} V${b.y} H${b.x}`;
      path.setAttribute("d", route);
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

function showDetails(node: LineageNode) {
  panel.hidden = false;
  inspect.scrollTop = 0;
  inspect.replaceChildren(text("h2", label(node.entity)));
  if (node.kind === "dataset") {
    const fields = schemas.get(entityKey(node.entity))?.fields;
    inspect.append(text("h3", "Schema"), fields?.length ? fieldList(fields, true) : text("p", schemaLabel(fields)));
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
    const { event, actions, mapping } = job.definition;
    inspect.append(text("h3", "Declared job"), text("p", "Planned lineage, not runtime telemetry."));
    if (actions.length) {
      const list = document.createElement("ul");
      list.append(...actions.map(action => text("li", action)));
      inspect.append(text("h3", "Actions"), list);
    }
    if (mapping) showMapping(mapping);
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
