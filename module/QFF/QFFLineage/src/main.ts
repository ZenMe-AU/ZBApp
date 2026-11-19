/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { datasetJobs, entityKey, readLineage, type Entity, type Run } from "./lineage.ts";
import "./style.css";

const files = import.meta.glob<string>("../events/**/*.json", { eager: true, query: "?raw", import: "default" });
const { jobs, errors } = readLineage(files);
const jobSelect = document.querySelector<HTMLSelectElement>("#jobs")!;
const view = document.querySelector<HTMLElement>("#view")!;
const warnings = document.querySelector<HTMLElement>("#errors")!;
const label = (entity: Entity) => `${entity.namespace} / ${entity.name}`;

function text(tag: string, content: string) {
  const element = document.createElement(tag);
  element.textContent = content;
  return element;
}

function column(title: string, entities: Entity[], select?: (entity: Entity) => void) {
  const section = document.createElement("section");
  section.append(text("h3", title));
  if (!entities.length) section.append(text("p", "None recorded"));
  for (const entity of entities) {
    const row = text(select ? "button" : "p", label(entity));
    if (select) row.addEventListener("click", () => select(entity));
    section.append(row);
  }
  return section;
}

function graph(left: HTMLElement, center: HTMLElement, right: HTMLElement) {
  const layout = document.createElement("div");
  layout.className = "lineage";
  layout.append(left, center, right);
  return layout;
}

function showDataset(entity: Entity) {
  const { producers, consumers } = datasetJobs(jobs, entity);
  const openJob = (job: Entity) => showJob(entityKey(job));
  view.replaceChildren(
    text("h2", "Dataset lineage across recorded runs"),
    graph(column("Producing jobs", producers, openJob), column("Dataset", [entity]), column("Consuming jobs", consumers, openJob)),
  );
  view.querySelector("h2")?.setAttribute("tabindex", "-1");
  view.querySelector("h2")?.focus();
}

function last(run: Run) {
  return run.sources[run.sources.length - 1].event;
}

function showJob(key: string) {
  const job = jobs.get(key);
  if (!job) return;
  jobSelect.value = key;
  const runs = [...job.runs.values()].sort((a, b) => Date.parse(last(b).eventTime) - Date.parse(last(a).eventTime));
  const picker = document.createElement("select");
  for (const run of runs) picker.add(new Option(`${last(run).eventTime} · ${last(run).eventType} · ${run.id}`, run.id));
  const field = text("label", "Run ");
  field.append(picker);
  const detail = document.createElement("div");
  view.replaceChildren(text("h2", "Run lineage"), field, detail);

  function showRun() {
    const run = job!.runs.get(picker.value)!;
    detail.replaceChildren(graph(column("Inputs", run.inputs, showDataset), column("Job", [job!.entity]), column("Outputs", run.outputs, showDataset)));
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
  warnings.append(text("h2", "Files that could not be loaded"), ...errors.map(error => text("p", error)));
}
for (const [key, job] of jobs) jobSelect.add(new Option(label(job.entity), key));
jobSelect.addEventListener("change", () => showJob(jobSelect.value));
if (jobs.size) showJob(jobSelect.value);
else {
  jobSelect.disabled = true;
  view.append(text("p", "No OpenLineage runs to display. Add a RunEvent JSON file under events/."));
}
