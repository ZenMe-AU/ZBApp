/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

export type Entity = { namespace: string, name: string };
export const entityKey = ({ namespace, name }: Entity) => JSON.stringify([namespace, name]);
type RunEvent = {
  eventTime: string;
  eventType: string;
  run: { runId: string };
  job: Entity;
  inputs?: Entity[];
  outputs?: Entity[];
};
type Source = { path: string, raw: string, event: RunEvent };
export type Run = { id: string, sources: Source[], inputs: Entity[], outputs: Entity[] };
type Job = { entity: Entity, runs: Map<string, Run> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isEntity(value: unknown): value is Entity {
  return isRecord(value) && hasText(value.namespace) && hasText(value.name);
}

function isRunEvent(value: unknown): value is RunEvent {
  return isRecord(value) && hasText(value.eventTime) && Number.isFinite(Date.parse(value.eventTime))
    && hasText(value.eventType) && isEntity(value.job) && isRecord(value.run) && hasText(value.run.runId)
    && [value.inputs, value.outputs].every(list => list === undefined || (Array.isArray(list) && list.every(isEntity)));
}

const uniqueEntities = (items: Entity[]) => [...new Map(items.map(item => [entityKey(item), item])).values()];

export function readLineage(files: Record<string, string>) {
  const jobs = new Map<string, Job>();
  const errors: string[] = [];
  for (const [path, raw] of Object.entries(files)) {
    let event: unknown;
    try {
      event = JSON.parse(raw);
    }
    catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      errors.push(`${path}: invalid JSON (${error.message})`);
      continue;
    }
    if (!isRunEvent(event)) {
      errors.push(`${path}: expected an OpenLineage RunEvent with a timestamp, event type, job, run ID and valid datasets when supplied.`);
      continue;
    }
    const key = entityKey(event.job);
    const job = jobs.get(key) ?? { entity: event.job, runs: new Map<string, Run>() };
    const run = job.runs.get(event.run.runId) ?? { id: event.run.runId, sources: [], inputs: [], outputs: [] };
    run.sources.push({ path, raw, event });
    job.runs.set(run.id, run);
    jobs.set(key, job);
  }
  for (const job of jobs.values()) {
    for (const run of job.runs.values()) {
      run.sources.sort((a, b) => Date.parse(a.event.eventTime) - Date.parse(b.event.eventTime));
      run.inputs = uniqueEntities(run.sources.flatMap(source => source.event.inputs ?? []));
      run.outputs = uniqueEntities(run.sources.flatMap(source => source.event.outputs ?? []));
    }
  }
  return { jobs, errors };
}

export function datasetJobs(jobs: Map<string, Job>, dataset: Entity) {
  const key = entityKey(dataset);
  const producers: Entity[] = [];
  const consumers: Entity[] = [];
  for (const { entity, runs } of jobs.values()) {
    const recorded = [...runs.values()];
    if (recorded.some(run => run.outputs.some(item => entityKey(item) === key))) producers.push(entity);
    if (recorded.some(run => run.inputs.some(item => entityKey(item) === key))) consumers.push(entity);
  }
  return { producers, consumers };
}
