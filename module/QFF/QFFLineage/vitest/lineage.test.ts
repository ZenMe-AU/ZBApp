/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { dependencyGraph, displaySchemaField, edgeKey, entityKey, graphLayout, nodeKey, readLineage } from "../src/lineage.ts";

const source = { namespace: "qff", name: "source" };
const dataset = { namespace: "qff", name: "references" };
const producer = { namespace: "qff", name: "index" };
const consumer = { namespace: "qff", name: "derive" };
const event = (fields: object) => JSON.stringify({
  eventTime: "2026-11-19T01:00:00Z", eventType: "START",
  job: producer, run: { runId: "first" }, ...fields,
});

it("labels arrays with [] and shows item fields without the synthetic _element row", () => {
  const fields = [{ name: "keyword", type: "string" }];
  const wrapper = { name: "_element", type: "object", fields };
  expect(displaySchemaField({ name: "interests", type: "array", fields: [wrapper] }))
    .toEqual({ label: "interests[]", children: fields });
  expect(displaySchemaField({ name: "topics", type: "array", fields: [{ name: "_element", type: "string" }] }))
    .toEqual({ label: "topics[]", children: undefined });
  expect(displaySchemaField({ name: "record", type: "object", fields: [wrapper] }))
    .toEqual({ label: "record", children: [wrapper] });
});

it("orders events, combines dataset edges within each run, and follows namespaced dataset links", () => {
  const { jobs, errors } = readLineage({
    "complete.json": event({ eventTime: "2026-11-19T01:01:00Z", eventType: "COMPLETE", outputs: [dataset, dataset] }),
    "start.json": event({ inputs: [source] }),
    "next.json": event({ run: { runId: "second" }, inputs: [dataset] }),
    "consumer.json": event({ job: consumer, inputs: [dataset] }),
    "other-namespace.json": event({ job: { ...consumer, namespace: "other" }, inputs: [{ ...dataset, namespace: "other" }] }),
  });
  const runs = jobs.get(entityKey(producer))?.runs;
  expect(errors).toEqual([]);
  expect(runs?.get("first")?.sources.map(source => source.path)).toEqual(["start.json", "complete.json"]);
  expect(runs?.get("first")).toMatchObject({ inputs: [source], outputs: [dataset] });
  expect(runs?.get("second")).toMatchObject({ inputs: [dataset], outputs: [] });
  const graph = dependencyGraph(jobs);
  expect(graph.downstream.get(nodeKey("dataset", dataset))).toEqual(new Set([nodeKey("job", producer), nodeKey("job", consumer)]));
});

it("reports malformed files without blocking valid runs", () => {
  const { jobs, errors } = readLineage({
    "broken.json": "{",
    "wrong-shape.json": event({ inputs: [{ name: "missing namespace" }] }),
    "valid.json": event({}),
  });
  expect([...jobs.keys()]).toEqual([entityKey(producer)]);
  expect(errors.map(error => error.split(":")[0])).toEqual(["broken.json", "wrong-shape.json"]);
});

it("lays out the full graph, including disconnected flows and isolated jobs", () => {
  const otherDataset = { ...dataset, namespace: "other" };
  const otherJob = { ...consumer, namespace: "other" };
  const isolated = { ...consumer, namespace: "isolated" };
  const { jobs } = readLineage({
    "index.json": event({ inputs: [source], outputs: [dataset, dataset] }),
    "derive.json": event({ job: consumer, inputs: [dataset], outputs: [consumer] }),
    "other.json": event({ inputs: [otherDataset], job: otherJob }),
    "isolated.json": event({ job: isolated }),
  });
  const graph = dependencyGraph(jobs);
  const shared = nodeKey("dataset", dataset);
  const index = nodeKey("job", producer);
  const derive = nodeKey("job", consumer);
  const output = nodeKey("dataset", consumer);
  const input = nodeKey("dataset", source);
  const { layers, edges } = graphLayout(graph);
  const otherInput = nodeKey("dataset", otherDataset);
  const otherConsumer = nodeKey("job", otherJob);
  expect(layers).toEqual(new Map([
    [input, 0], [index, 1], [shared, 2], [derive, 3], [output, 4],
    [otherInput, 0], [otherConsumer, 1], [nodeKey("job", isolated), 0],
  ]));
  expect(new Set(edges)).toEqual(new Set([
    { from: input, to: index }, { from: index, to: shared }, { from: shared, to: derive },
    { from: derive, to: output }, { from: otherInput, to: otherConsumer },
  ]));
  expect(edges).toHaveLength(5);
});

it("renders a dataset read and written by the same job as one node with two directions", () => {
  const { jobs } = readLineage({ "update.json": event({ inputs: [dataset], outputs: [dataset] }) });
  const graph = dependencyGraph(jobs);
  const job = nodeKey("job", producer);
  const shared = nodeKey("dataset", dataset);
  const { layers, edges } = graphLayout(graph);
  expect(new Set(layers.keys())).toEqual(new Set([job, shared]));
  expect(edges).toEqual([{ from: job, to: shared }, { from: shared, to: job }]);
});

it("keeps the latest valid schema per namespaced dataset without losing edges on malformed facets", () => {
  const fields = [{ name: "items", type: "array", fields: [{ name: "_element" }] }];
  const withSchema = (entity: typeof dataset, fields: unknown[]) => ({ ...entity, facets: { schema: { fields } } });
  const { jobs, schemas, errors } = readLineage({
    "new.json": event({ eventTime: "2026-11-19T02:00:00Z", outputs: [withSchema(dataset, fields)] }),
    "old.json": event({ outputs: [withSchema(dataset, [{ name: "old" }])] }),
    "other.json": event({ inputs: [withSchema({ ...dataset, namespace: "other" }, [{ name: "other" }])] }),
    "missing.json": event({ eventTime: "2026-11-19T03:00:00Z", inputs: [dataset] }),
    "bad.json": event({ eventTime: "2026-11-19T04:00:00Z", inputs: [withSchema(dataset, [{ name: 7 }])] }),
  });
  expect(schemas.get(entityKey(dataset))?.fields).toEqual(fields);
  expect(schemas.get(entityKey({ ...dataset, namespace: "other" }))?.fields).toEqual([{ name: "other" }]);
  expect(errors).toEqual([expect.stringMatching(/^bad\.json: invalid schema fields/)]);
  expect(dependencyGraph(jobs).downstream.get(nodeKey("dataset", dataset))).toContain(nodeKey("job", producer));
});

it("maps user data through QFFIdentity and the API into repository files", () => {
  const dir = new URL("../events/baseline/", import.meta.url);
  const files = Object.fromEntries(readdirSync(dir, { recursive: true }).filter(name => name.endsWith(".json"))
    .map(name => [name, readFileSync(new URL(name.replaceAll("\\", "/"), dir), "utf8")]));
  const { jobs, datasets, errors, schemas, declared } = readLineage(files);
  const graph = dependencyGraph(jobs, datasets.values(), declared);
  const kinds = ["identity", "properties", "relations"];
  const expected = kinds.map(kind => ({ namespace: "identity-repository", name: `<id>-${kind}.json` }));
  const api = kinds.map(kind => ({ namespace: "identity-repository-api", name: kind }));
  const profile = { namespace: "IdentityUser", name: "identity-profile" };
  const preferences = { namespace: "IdentityUser", name: "preferences" };
  const relations = { namespace: "IdentityUser", name: "relations" };
  const user = [profile, preferences, relations];
  const ui = user.map(({ name }) => ({ namespace: "QFFIdentity", name }));
  const actions = [
    ["capture-profile", ["Save profile edits", "Approve an inferred persona"]],
    ["capture-preferences", ["Save preference edits", "Approve suggested preference wording"]],
    ["capture-relations", ["Submit relation edits"]],
  ] as const;
  const uiJobs = actions.map(([name]) => ({ namespace: "QFFIdentity", name }));
  const submissions = ["submit-profile", "submit-preferences", "submit-relations"]
    .map(name => ({ namespace: "QFFIdentity", name }));
  const namespaces = [
    "data-analyst", "qff-platform-operator", "QFFLineage", "QFFMatcher",
    "QFFModeler", "QFFViz", "vscode-platform-administration",
    "qff-repository-api", "matcher-service", "semantic-derivation-service", "qff-repository",
  ];
  expect(errors).toEqual([]);
  expect(jobs.size).toBe(6);
  expect(new Set(graph.nodes.keys())).toEqual(new Set([
    ...[...expected, ...api, ...ui, ...user].map(entity => nodeKey("dataset", entity)),
    ...namespaces.map(namespace => nodeKey("dataset", { namespace, name: "placeholder" })),
    ...[...uiJobs, ...submissions].map(entity => nodeKey("job", entity)),
  ]));
  const edges = graphLayout(graph).edges;
  expect(new Set(edges)).toEqual(new Set(expected.flatMap((repository, i) => [
    { from: nodeKey("dataset", user[i]), to: nodeKey("job", uiJobs[i]) },
    { from: nodeKey("job", uiJobs[i]), to: nodeKey("dataset", ui[i]) },
    { from: nodeKey("dataset", ui[i]), to: nodeKey("job", submissions[i]) },
    { from: nodeKey("job", submissions[i]), to: nodeKey("dataset", api[i]) },
    { from: nodeKey("dataset", api[i]), to: nodeKey("dataset", repository) },
  ])));
  expect(graph.declaredEdges).toEqual(new Set(edges.map(({ from, to }) => edgeKey(from, to))));
  expect(schemas.size).toBe(12);
  for (const [i, input] of api.entries()) {
    expect(schemas.get(entityKey(input))?.fields).toEqual(schemas.get(entityKey(expected[i]))?.fields);
    expect(declared.find(link => entityKey(link.destination) === entityKey(expected[i])))
      .toMatchObject({ mapping: "direct-copy", source: input });
    const submission = jobs.get(entityKey(submissions[i]));
    expect(submission?.definition?.mapping).toMatchObject({
      mapping: i === 1 ? "flatten-by-kind" : "direct-copy", resolveIdentity: true,
    });
    expect(submission?.definition?.actions).toContain("Resolve external ID at the API boundary");
    expect(submission?.runs.size).toBe(0);
    const job = jobs.get(entityKey(uiJobs[i]));
    expect(job?.definition?.actions).toEqual(actions[i][1]);
    expect(job?.runs.size).toBe(0);
    const userFields = schemas.get(entityKey(user[i]))?.fields;
    expect(schemas.get(entityKey(ui[i]))?.fields).toEqual(userFields);
    const names = userFields?.map(field => field.name);
    expect(names).toContain("external_id");
    expect(names).not.toContain("identity_id");
  }
  const profileFields = schemas.get(entityKey(profile))?.fields;
  expect(profileFields?.filter(field => field.name !== "external_id"))
    .toEqual(schemas.get(entityKey(expected[0]))?.fields.filter(field => field.name !== "identity_id"));
  const personas = profileFields?.find(field => field.name === "personas");
  expect(personas?.type).toBe("array");
  expect(personas?.fields?.[0].fields?.map(({ name, type }) => [name, type]))
    .toEqual([["name", "string"], ["description", "string"]]);
  expect(schemas.get(entityKey(relations))?.fields.filter(field => field.name !== "external_id"))
    .toEqual(schemas.get(entityKey(expected[2]))?.fields.filter(field => field.name !== "identity_id"));

  const kindByGroup = { interests: "interest", wants: "want", values: "value", boundaries: "boundary" };
  expect(jobs.get(entityKey(submissions[1]))?.definition?.mapping)
    .toMatchObject({ mapping: "flatten-by-kind", kindByGroup });
  const propertyFields = schemas.get(entityKey(expected[1]))?.fields[1].fields?.[0].fields;
  expect(propertyFields).toContainEqual(expect.objectContaining({ name: "kind", type: "string" }));
  const groups = schemas.get(entityKey(preferences))?.fields[1].fields;
  expect(groups?.map(group => group.name)).toEqual(Object.keys(kindByGroup));
  for (const group of groups ?? []) {
    expect(group.type).toBe("array");
    expect(group.fields?.[0].fields).toEqual(propertyFields?.filter(field => field.name !== "kind"));
  }
});

it("keeps a declared job and its observed run distinct when they share an edge", () => {
  const { jobs, errors } = readLineage({
    "run.json": event({ inputs: [source] }),
    "job.json": JSON.stringify({ eventTime: "2026-11-19T01:00:00Z", job: producer, inputs: [source], outputs: [dataset] }),
  });
  const graph = dependencyGraph(jobs);
  expect(errors).toEqual([]);
  expect(jobs.get(entityKey(producer))?.runs.size).toBe(1);
  expect(graph.declaredEdges).toEqual(new Set([edgeKey(nodeKey("job", producer), nodeKey("dataset", dataset))]));
});

it("seeds each identity fixture with the approved legacy persona names and standalone descriptions", () => {
  const dir = new URL("../../Identities/", import.meta.url);
  for (const { name: id } of readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
    const read = (suffix: string) => JSON.parse(readFileSync(new URL(`${id}/${id}-${suffix}.json`, dir), "utf8"));
    const { personas } = read("identity");
    const { personas: legacy } = read("test-context");
    expect(personas.map(({ name }: { name: string }) => name), id)
      .toEqual(legacy.map(({ persona }: { persona: string }) => persona));
    for (const persona of personas) {
      expect(Object.keys(persona).sort(), id).toEqual(["description", "name"]);
      expect(persona.description, id).toEqual(expect.stringMatching(/\S/));
    }
  }
});

it("warns about an invalid direct-copy facet without dropping the destination dataset", () => {
  const { jobs, datasets, errors, declared } = readLineage({
    "bad.json": JSON.stringify({
      eventTime: "2026-11-19T01:00:00Z",
      dataset: { ...dataset, facets: { qff_lineage: {
        _producer: "urn:test", _schemaURL: "https://example.com/facet.json",
        source: { name: "missing namespace" }, mapping: "direct-copy",
      } } },
    }),
  });

  const graph = dependencyGraph(jobs, datasets.values(), declared);
  expect(errors).toEqual([expect.stringMatching(/^bad\.json: invalid qff_lineage facet/)]);
  expect(graph.nodes.has(nodeKey("dataset", dataset))).toBe(true);
  expect(graphLayout(graph).edges).toEqual([]);
});

it("rejects a grouped preference mapping without a valid group-to-kind lookup", () => {
  const { declared, errors } = readLineage({
    "bad.json": JSON.stringify({
      eventTime: "2026-11-19T01:00:00Z",
      dataset: { ...dataset, facets: { qff_lineage: {
        _producer: "urn:test", _schemaURL: "https://example.com/facet.json",
        source, mapping: "flatten-by-kind", kindByGroup: { interests: 1 },
      } } },
    }),
  });
  expect(errors).toEqual([expect.stringMatching(/^bad\.json: invalid qff_lineage facet/)]);
  expect(declared).toEqual([]);
});
