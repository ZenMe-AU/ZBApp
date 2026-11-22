/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

export type Entity = { namespace: string, name: string };
export const entityKey = ({ namespace, name }: Entity) => JSON.stringify([namespace, name]);
export const baselineProducer = "urn:qff:lineage:baseline";
export type SchemaField = { name: string, type?: string, description?: string, fields?: SchemaField[] };

export function displaySchemaField(field: SchemaField) {
  const isArray = field.type === "array";
  const children = field.fields;
  const element = isArray && children?.length === 1 && children[0].name === "_element" ? children[0] : undefined;
  return {
    label: isArray ? `${field.name}[]` : field.name,
    children: element ? element.fields : children,
  };
}

type Dataset = Entity & { facets?: unknown };
type DeclaredMapping = { mapping: "direct-copy" }
  | { mapping: "flatten-by-kind", kindByGroup: Record<string, string> };
export type Mapping = DeclaredMapping & { resolveIdentity?: boolean };
type DeclaredLineage = Mapping & { source: Entity, destination: Entity };
type JobEvent = {
  eventTime: string;
  producer?: unknown;
  job: Entity & { facets?: unknown };
  inputs?: Dataset[];
  outputs?: Dataset[];
};
type RunEvent = JobEvent & { eventType: string, run: { runId: string } };
type Source = { path: string, raw: string, event: RunEvent };
export type Run = { id: string, sources: Source[], inputs: Entity[], outputs: Entity[] };
type Transformation = { type: string, subtype?: string, description?: string };
export type ColumnLineage = {
  dataset: Entity;
  fields: { field: string, inputs: { dataset: Entity, field: string, transformations: Transformation[] }[] }[];
};
type JobDefinition = {
  event: JobEvent;
  description?: string;
  operation?: "query" | "command";
  columnLineage: ColumnLineage[];
};
type Job = { entity: Entity, runs: Map<string, Run>, definition?: JobDefinition };
type NodeKind = "job" | "dataset";
export type LineageNode = { id: string, kind: NodeKind, entity: Entity };
export const nodeKey = (kind: NodeKind, entity: Entity) => `${kind}:${entityKey(entity)}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isEntity(value: unknown): value is Entity {
  return isRecord(value) && hasText(value.namespace) && hasText(value.name);
}

function isKindByGroup(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([group, kind]) => hasText(group) && hasText(kind));
}

function readMapping(facet: Record<string, unknown>): Mapping | undefined {
  const { resolveIdentity } = facet;
  if (resolveIdentity !== undefined && typeof resolveIdentity !== "boolean") return;
  if (facet.mapping === "direct-copy") return { mapping: facet.mapping, resolveIdentity };
  if (facet.mapping === "flatten-by-kind" && isKindByGroup(facet.kindByGroup)) {
    return { mapping: facet.mapping, kindByGroup: facet.kindByGroup, resolveIdentity };
  }
}

function readColumnLineage(output: Dataset): ColumnLineage | undefined | null {
  if (!isRecord(output.facets) || !("columnLineage" in output.facets)) return;
  const facet = output.facets.columnLineage;
  if (!isRecord(facet) || !isRecord(facet.fields)) return null;
  const fields: ColumnLineage["fields"] = [];
  for (const [field, value] of Object.entries(facet.fields)) {
    if (!isRecord(value) || !Array.isArray(value.inputFields)) return null;
    const inputs: ColumnLineage["fields"][number]["inputs"] = [];
    for (const input of value.inputFields) {
      if (!isEntity(input) || !hasText((input as Record<string, unknown>).field)) return null;
      const { field: inputField, transformations = [] } = input as Entity & { field: string, transformations?: unknown };
      if (!Array.isArray(transformations) || !transformations.every(isTransformation)) return null;
      inputs.push({
        dataset: { namespace: input.namespace, name: input.name },
        field: inputField,
        transformations: transformations.map(({ type, subtype, description }) => ({ type, subtype, description })),
      });
    }
    fields.push({ field, inputs });
  }
  return { dataset: { namespace: output.namespace, name: output.name }, fields };
}

function isTransformation(value: unknown): value is Transformation {
  return isRecord(value) && hasText(value.type)
    && (value.subtype === undefined || typeof value.subtype === "string")
    && (value.description === undefined || typeof value.description === "string");
}

export function columnLineageLines({ fields }: ColumnLineage) {
  return fields.flatMap(({ field, inputs }) => inputs.map(({ dataset, field: inputField, transformations }) => {
    const how = transformations.map(({ type, subtype, description }) =>
      [[type, subtype].filter(Boolean).join(" "), description].filter(Boolean).join(": ")).join("; ");
    return `${field} ← ${dataset.namespace} / ${dataset.name}.${inputField}${how ? ` (${how})` : ""}`;
  }));
}

function isSchemaField(value: unknown): value is SchemaField {
  return isRecord(value) && hasText(value.name)
    && (value.type === undefined || typeof value.type === "string")
    && (value.description === undefined || typeof value.description === "string")
    && (value.fields === undefined || (Array.isArray(value.fields) && value.fields.every(isSchemaField)));
}

function isDatasetEvent(value: unknown): value is { eventTime: string, dataset: Dataset } {
  return isRecord(value) && !("job" in value) && !("run" in value)
    && hasText(value.eventTime) && Number.isFinite(Date.parse(value.eventTime)) && isEntity(value.dataset);
}

function isJobMetadata(value: unknown): value is JobEvent {
  return isRecord(value) && hasText(value.eventTime) && Number.isFinite(Date.parse(value.eventTime))
    && isEntity(value.job)
    && [value.inputs, value.outputs].every(list => list === undefined || (Array.isArray(list) && list.every(isEntity)));
}

function isRunEvent(value: JobEvent): value is RunEvent {
  return "eventType" in value && hasText(value.eventType)
    && "run" in value && isRecord(value.run) && hasText(value.run.runId);
}

const uniqueEntities = (items: Entity[]) => [...new Map(items.map(item => [entityKey(item), item])).values()];

export function readLineage(files: Record<string, string>) {
  const jobs = new Map<string, Job>();
  const datasets = new Map<string, Dataset>();
  const errors: string[] = [];
  const schemas = new Map<string, { fields: SchemaField[], time: number }>();
  const declared = new Map<string, DeclaredLineage & { time: number }>();

  function recordSchema(dataset: Dataset, eventTime: string, path: string) {
    if (!isRecord(dataset.facets) || !("schema" in dataset.facets)) return;
    const schema = dataset.facets.schema;
    if (!isRecord(schema) || !Array.isArray(schema.fields) || !schema.fields.every(isSchemaField)) {
      errors.push(`${path}: invalid schema fields for ${dataset.namespace} / ${dataset.name}; dataset retained.`);
      return;
    }
    const id = entityKey(dataset);
    const time = Date.parse(eventTime);
    if (time >= (schemas.get(id)?.time ?? -Infinity)) schemas.set(id, { fields: schema.fields, time });
  }

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
    if (isDatasetEvent(event)) {
      datasets.set(entityKey(event.dataset), event.dataset);
      recordSchema(event.dataset, event.eventTime, path);
      const { facets, namespace, name } = event.dataset;
      if (isRecord(facets) && "qff_lineage" in facets) {
        const facet = facets.qff_lineage;
        const mapping = isRecord(facet) ? readMapping(facet) : undefined;
        if (!mapping || !isRecord(facet) || !hasText(facet._producer) || !hasText(facet._schemaURL)
          || !isEntity(facet.source)
          || entityKey(facet.source) === entityKey(event.dataset)) {
          errors.push(`${path}: invalid qff_lineage facet for ${namespace} / ${name}; dataset retained.`);
        } else {
          const key = entityKey(event.dataset), time = Date.parse(event.eventTime);
          if (time >= (declared.get(key)?.time ?? -Infinity)) {
            declared.set(key, { ...mapping, source: facet.source, destination: { namespace, name }, time });
          }
        }
      }
      continue;
    }
    if (!isJobMetadata(event)) {
      errors.push(`${path}: expected a valid OpenLineage DatasetEvent, JobEvent, or RunEvent.`);
      continue;
    }
    const key = entityKey(event.job);
    const job: Job = jobs.get(key) ?? { entity: event.job, runs: new Map<string, Run>() };
    if (isRunEvent(event)) {
      const run = job.runs.get(event.run.runId) ?? { id: event.run.runId, sources: [], inputs: [], outputs: [] };
      run.sources.push({ path, raw, event });
      job.runs.set(run.id, run);
    } else if (!("run" in event) && !("eventType" in event)) {
      const facets = isRecord(event.job.facets) ? event.job.facets : {};
      const { jobType, documentation } = facets;
      if (jobType !== undefined && !(isRecord(jobType) && hasText(jobType.integration) && hasText(jobType.processingType)
        && (jobType.jobType === undefined || hasText(jobType.jobType)))) {
        errors.push(`${path}: invalid jobType facet; declaration skipped.`);
        continue;
      }
      const jobKind = isRecord(jobType) && typeof jobType.jobType === "string" ? jobType.jobType.toUpperCase() : undefined;
      const operation = jobKind === "QUERY" ? "query" : jobKind === "COMMAND" ? "command" : undefined;
      const readsStorage = event.inputs?.some(dataset => dataset.namespace === "identity-repository");
      const writesStorage = event.outputs?.some(dataset => dataset.namespace === "identity-repository");
      if ((readsStorage && operation !== "query") || (writesStorage && operation !== "command")) {
        errors.push(`${path}: CQRS violation; only queries may read identity storage and only commands may write it. Declaration skipped.`);
        continue;
      }
      const validDocumentation = isRecord(documentation) && hasText(documentation.description);
      if (documentation !== undefined && !validDocumentation) errors.push(`${path}: invalid documentation facet; job retained.`);
      const columnLineage: ColumnLineage[] = [];
      for (const output of event.outputs ?? []) {
        const lineage = readColumnLineage(output);
        if (lineage) columnLineage.push(lineage);
        else if (lineage === null) errors.push(`${path}: invalid columnLineage facet for ${output.namespace} / ${output.name}; lineage ignored.`);
      }
      if (!job.definition || Date.parse(event.eventTime) >= Date.parse(job.definition.event.eventTime)) {
        job.definition = {
          event, operation, columnLineage,
          description: validDocumentation ? documentation.description as string : undefined,
        };
      }
    } else {
      errors.push(`${path}: expected a valid OpenLineage RunEvent.`);
      continue;
    }
    jobs.set(key, job);
    for (const dataset of [...event.inputs ?? [], ...event.outputs ?? []]) recordSchema(dataset, event.eventTime, path);
  }
  for (const job of jobs.values()) {
    for (const run of job.runs.values()) {
      run.sources.sort((a, b) => Date.parse(a.event.eventTime) - Date.parse(b.event.eventTime));
      run.inputs = uniqueEntities(run.sources.flatMap(source => source.event.inputs ?? []));
      run.outputs = uniqueEntities(run.sources.flatMap(source => source.event.outputs ?? []));
    }
  }
  return { jobs, datasets, errors, schemas, declared: [...declared.values()] };
}

export const edgeKey = (from: string, to: string) => JSON.stringify([from, to]);

export function dependencyGraph(jobs: Map<string, Job>, datasets: Iterable<Entity> = [], declared: Iterable<DeclaredLineage> = []) {
  const nodes = new Map<string, LineageNode>();
  const upstream = new Map<string, Set<string>>();
  const downstream = new Map<string, Set<string>>();
  const declaredEdges = new Set<string>();

  function addNode(kind: NodeKind, entity: Entity) {
    const id = nodeKey(kind, entity);
    nodes.set(id, { id, kind, entity });
    return id;
  }

  function link(from: string, to: string, declared = false) {
    if (!downstream.has(from)) downstream.set(from, new Set());
    if (!upstream.has(to)) upstream.set(to, new Set());
    downstream.get(from)!.add(to);
    upstream.get(to)!.add(from);
    if (declared) declaredEdges.add(edgeKey(from, to));
    else declaredEdges.delete(edgeKey(from, to));
  }

  for (const dataset of datasets) addNode("dataset", dataset);
  for (const { source, destination } of declared) link(addNode("dataset", source), addNode("dataset", destination), true);
  for (const { entity, runs, definition } of jobs.values()) {
    const job = addNode("job", entity);
    if (definition) {
      for (const input of definition.event.inputs ?? []) link(addNode("dataset", input), job, true);
      for (const output of definition.event.outputs ?? []) link(job, addNode("dataset", output), true);
    }
    for (const run of runs.values()) {
      for (const input of run.inputs) link(addNode("dataset", input), job);
      for (const output of run.outputs) link(job, addNode("dataset", output));
    }
  }
  return { nodes, upstream, downstream, declaredEdges };
}

export function namespaceLayout({ nodes, upstream, downstream }: ReturnType<typeof dependencyGraph>) {
  const primary = ["IdentityUser", "QFFIdentity", "identity-repository-api", "identity-repository"];
  const namespaces = new Map<string, LineageNode[]>();
  const placeholders: LineageNode[] = [];
  for (const node of nodes.values()) {
    if (node.kind === "dataset" && node.entity.name === "placeholder" && !upstream.has(node.id) && !downstream.has(node.id)) {
      placeholders.push(node);
      continue;
    }
    const namespace = node.entity.namespace;
    if (!namespaces.has(namespace)) namespaces.set(namespace, []);
    namespaces.get(namespace)!.push(node);
  }
  const order = [...primary.filter(namespace => namespaces.has(namespace)),
    ...[...namespaces.keys()].filter(namespace => !primary.includes(namespace)).sort()];
  const indices = new Map(order.map((namespace, i) => [namespace, i]));
  const groups = order.map((namespace, index) => {
    const lanes = { left: [] as LineageNode[], middle: [] as LineageNode[], right: [] as LineageNode[] };
    for (const node of namespaces.get(namespace)!.sort((a, b) => a.entity.name.localeCompare(b.entity.name))) {
      const neighbors = node.kind === "job" ? [...upstream.get(node.id) ?? [], ...downstream.get(node.id) ?? []] : [];
      const sides = neighbors.map(id => indices.get(nodes.get(id)!.entity.namespace)! - index);
      // Keep a job that touches both boundaries on the repository-facing side.
      lanes[sides.some(side => side > 0) ? "right" : sides.some(side => side < 0) ? "left" : "middle"].push(node);
    }
    return { namespace, lanes };
  });
  const edges = [...downstream].flatMap(([from, targets]) => [...targets].map(to => ({ from, to })));
  placeholders.sort((a, b) => a.entity.namespace.localeCompare(b.entity.namespace));
  return { groups, placeholders, edges };
}
