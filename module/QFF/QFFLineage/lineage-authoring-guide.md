# Populating QFFLineage: guide for AI contributors

Start with the [QFF business context and system interactions](../plan-canonical-ontology.md#business-context). Use those to identify candidate data flows, then check the owning component's docs and implementation for what it actually reads and writes. The business context describes who interacts with whom; it does not prove that a job ran.

## Translate an interaction into lineage

- **Job:** Name the repeatable operation, not the person, screen, or button. For example, an identity user saving a preference in QFFIdentity triggers `capture-preference`; the Identity Repository validates the submission and persists it. The user is the trigger, not a dataset.
- **Datasets:** Name the logical data read or produced, using the same namespace and name wherever it appears. A submitted form can be a logical input dataset even if it is not stored separately. Do not model ordinary navigation or a service-to-service call as a transformation unless it has a meaningful data dependency.
- **Run:** A save, match request, or batch is one execution of a job. A workflow can run repeatedly in response to user actions without being a continuously running process. For a genuinely continuous workflow, use meaningful execution boundaries such as committed batches or checkpoint windows; do not emit a run for each click or invent periodic runs.

| Business action | Job | Inputs | Outputs |
| --- | --- | --- | --- |
| Identity user saves a preference | `submit-preferences` | Preference submission | API properties object mapped to stored preferences |
| Analyst triggers semantic derivation (planned) | `derive-semantics` | Identity preferences and the canonical catalogue | Derived vectors and mappings |
| Customer requests a match (planned) | `compute-match` | Match request and the authorized data used by the matcher | Minimal match transaction and requester-scoped result |

These are modeling candidates, not records of runs. A read-only screen does not need a corresponding lineage job just because it appears in the business context.

## QFFIdentity dataset boundaries

Use `IdentityUser` for source data supplied by the identity user, such as a profile submission. The person is not a dataset, and repository jobs do not write to this namespace. Use `identity-repository` for persisted identity documents and `QFFIdentity` for UI-owned data shapes. A UI dataset can hold data shown on screen or meaningful internal state, even if it exists only in browser memory. Record a distinct dataset when it explains a transformation or handoff, not for individual controls or loading flags.

The [initial baseline](./events/baseline/) declares the planned write path through [QFFIdentity](./events/baseline/qff-identity/) and the repository API to the persisted files. Standalone `placeholder` datasets show namespaces with no recorded schema. The baseline does not record any runs.

## Declare UI actions without recording a run

Use an OpenLineage `JobEvent` with named input and output datasets, and describe the job with standard facets only:

- `jobType`: `processingType: "SERVICE"`, `integration: "QFF"`, and `jobType: "QUERY"` or `"COMMAND"` for declared storage operations (omit `jobType` for UI-only preparation jobs).
- `documentation`: `description` (`contentType: "text/plain"`) lists the actions, one sentence per line, each ending with a full stop. Append a final `Query parameters: a, b.` line for a query's selectors.

[capture-preferences](./events/baseline/qff-identity/capture-preferences.json) models ordinary edits; suggestion approval is a separate workflow.

- Use one job for a synchronous query, not separate cards for sending the request and receiving its result. Record selectors in the `documentation` description, not as input datasets. Arrows trace data dependencies, not HTTP requests or execution order.
- Label declared storage operations with `jobType: "QUERY"` or `jobType: "COMMAND"`. The viewer rejects declared inputs in `identity-repository` unless the job is a query, and rejects outputs there unless it is a command. UI-only preparation jobs need neither value. This check applies to declarations, not observed runs or API runtime behavior.
- [Profile loading](./events/baseline/profile-workflows/read-profile.json) reads the repository files through the API into one editor snapshot with the preference revision. `external_id` selects the profile without adding an arrow. Reloading after a stale revision reuses this query; it does not automatically retry the write.
- [Preference approval](./events/baseline/profile-workflows/capture-preference-approval.json) captures explicit consent for a suggestion. The [supersession job](./events/baseline/profile-workflows/mark-superseded-preferences.json) prepares one approval command for the API. The planned [commit](./events/baseline/profile-workflows/commit-preference-approval.json) is an atomic conditional write against the expected revision: it creates a new active preference and marks its sources superseded without rewriting their wording or reading the properties file as a job input. The command returns success or conflict only. The runtime approval API is not implemented.

## Declare a dataset mapping without recording a run

Prefer the standard `columnLineage` facet on a job's outputs. Use the custom dataset facet only for a mapping that has no job yet, so the design is still captured. Put `facets.qff_lineage` on the **destination** `DatasetEvent`, using the custom [LineageDatasetFacet](./schemas/1-0-0/LineageDatasetFacet.json). Set `source` to the exact upstream `namespace` and `name`. A dashed arrow shows the declaration, not a transfer that has been observed. When a job's `columnLineage` later covers the same mapping, the viewer shows both; the designer removes the dataset facet once it duplicates the job.

- Use `mapping: "direct-copy"` when fields and types correspond one-to-one by name, as in the [profile](./events/baseline/identity.json) and [relations](./events/baseline/relations.json) mappings.
- The [Identity Repository API write model](./events/baseline/identity-repository-api/) uses one `SchemaDatasetFacet` per create-profile input object (`identity`, `properties`, `relations`), with fields matching the destination file. This models the declared field mapping, not the read response, revision, or legacy test context.
- User and QFFIdentity schemas carry `external_id` as shared login context, not as a field in each HTTP body object. In a fixture create request it is supplied once at the top level. The submission jobs map `external_id` to `identity_id` with a `DIRECT` `TRANSFORMATION` in the output's standard `columnLineage` facet to show the lookup at the API boundary. The IDs are equal only in fixture mode. Only `identity_id` is persisted and used in file paths.
- The [submit-preferences job](./events/baseline/identity-repository-api/submit-preferences.json) maps `preferences` with a `columnLineage` transformation whose `description` states that `interests`, `wants`, `values`, and `boundaries` become `interest`, `want`, `value`, and `boundary` in `preferences[].kind`. The API object maps to the repository file by field name; the fixture repository assigns a preference ID on creation if one is absent.
- Keep only approved personas in the profile: each entry has a `name` matching a named preference affinity and one AI-generated `description` inferred from preferences. Synthetic fixtures assume approval for the names in legacy test context. The scripted narratives remain on disk for existing consumers but are not part of the lineage model. Do not copy persona values into lineage events.

## Write and review the events

1. **Separate baseline metadata from observed runs.** Use `DatasetEvent` for standalone dataset schemas. The baseline uses `urn:qff:lineage:baseline` as its producer and records when metadata was captured, not when a job executed.
2. **Use one event per JSON file.** For observed `RunEvent` files, reuse the job namespace/name and UUID `run.runId` across a run's events. Record `START` and the actual terminal outcome (`COMPLETE`, `FAIL`, or `ABORT`) when available. Put successful outputs on `COMPLETE` after they are committed; a rejected save does not produce a new preferences output.
3. **Keep the graph at dataset level.** Use dataset names such as `identity-preferences`, not per-person filenames or IDs. Do not include form values, preference text, contact data, credentials, or raw request bodies in names, facets, or event payloads. The viewer exposes the raw JSON and includes event files in its build.
4. **Check the graph in the viewer.** Select the dataset to inspect its schema. If run events are present, also verify that arrows point from inputs to jobs to outputs. Check for load warnings. The viewer checks the fields it needs, not full schema conformance.
5. **Record dataset schemas, not data.** Use the OpenLineage [Schema Dataset Facet](https://openlineage.io/docs/spec/facets/dataset-facets/schema/) in the dataset's `facets.schema`, with `_producer`, `_schemaURL`, and `fields`. Verify field names and types against the owning schema or checked-in fixture shapes. Leave unavailable schemas unrecorded.
