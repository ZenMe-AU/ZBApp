# Populating QFFLineage: guide for AI contributors

Start with the [QFF business context and system interactions](../plan-canonical-ontology.md#business-context). Use those to identify candidate data flows, then check the owning component's docs and implementation for what it actually reads and writes. The business context describes who interacts with whom; it does not prove that a job ran.

## Translate an interaction into lineage

- **Job:** Name the repeatable operation, not the person, screen, or button. For example, an identity user saving a preference in QFFIdentity triggers `capture-preference`; the Identity Repository validates the submission and persists it. The user is the trigger, not a dataset.
- **Datasets:** Name the logical data read or produced, using the same namespace and name wherever it appears. A submitted form can be a logical input dataset even if it is not stored separately. Include existing preferences as an input if the operation reads them to apply an edit. Do not model ordinary navigation or a service-to-service call as a transformation unless it has a meaningful data dependency.
- **Run:** A save, match request, or batch is one execution of a job. A workflow can run repeatedly in response to user actions without being a continuously running process. For a genuinely continuous workflow, use meaningful execution boundaries such as committed batches or checkpoint windows; do not emit a run for each click or invent periodic runs.

| Business action | Job | Inputs | Outputs |
| --- | --- | --- | --- |
| Identity user saves a preference | `capture-preference` | Preference submission; existing identity preferences when editing | Committed identity preferences |
| Analyst triggers semantic derivation (planned) | `derive-semantics` | Identity preferences and the canonical catalogue | Derived vectors and mappings |
| Customer requests a match (planned) | `compute-match` | Match request and the authorized data used by the matcher | Minimal match transaction and requester-scoped result |

These are modeling candidates, not records of runs. A read-only screen does not need a corresponding lineage job just because it appears in the business context.

## QFFIdentity dataset boundaries

Use `IdentityUser` for source data supplied by the identity user, such as a profile submission. The person is not a dataset, and repository jobs do not write to this namespace. Use `identity-repository` for persisted identity documents and `QFFIdentity` for UI-owned data shapes. A UI dataset can hold data shown on screen or meaningful internal state, even if it exists only in browser memory. Record a distinct dataset when it explains a transformation or handoff, not for individual controls or loading flags.

The [initial baseline](./events/baseline/) declares the planned write path through [QFFIdentity](./events/baseline/qff-identity/) and the repository API to the persisted files. Standalone `placeholder` datasets show namespaces with no recorded schema. The baseline does not record any runs.

## Declare UI actions without recording a run

Use an OpenLineage `JobEvent` with named input and output datasets. Put the custom [LineageJobFacet](./schemas/1-0-0/LineageJobFacet.json) under `job.facets.qff_lineage` and list the actions in `actions`. [capture-preferences](./events/baseline/qff-identity/capture-preferences.json) models ordinary edits; suggestion approval is a separate workflow.

- [Profile loading](./events/baseline/profile-workflows/read-profile.json) starts with the user's profile selection. QFFIdentity reads through the API and loads an editor snapshot with the preference revision. Reloading after a stale revision reuses this read path; it does not automatically retry the write.
- [Preference approval](./events/baseline/profile-workflows/capture-preference-approval.json) captures explicit consent for a suggestion. The [supersession job](./events/baseline/profile-workflows/mark-superseded-preferences.json) prepares one approval command for the API. The repository commits a new active preference linked to the inference and marks its source preferences superseded without rewriting their wording. The [committed result](./events/baseline/profile-workflows/committed-preference-approval.json) is a logical view of the changes in the properties document, not another file. Suggestion delivery and the approval API contract are not defined by this graph.

## Declare a dataset mapping without recording a run

Put `facets.qff_lineage` on the **destination** `DatasetEvent`, using the custom [LineageDatasetFacet](./schemas/1-0-0/LineageDatasetFacet.json). Set `source` to the exact upstream `namespace` and `name`. A dashed arrow shows the declaration, not a transfer that has been observed.

- Use `mapping: "direct-copy"` when fields and types correspond one-to-one by name, as in the [profile](./events/baseline/identity.json) and [relations](./events/baseline/relations.json) mappings.
- The [Identity Repository API write model](./events/baseline/identity-repository-api/) uses one `SchemaDatasetFacet` per create-profile input object (`identity`, `properties`, `relations`), with fields matching the destination file. This models the declared field mapping, not the read response, revision, or legacy test context.
- User and QFFIdentity schemas carry `external_id` as shared login context, not as a field in each HTTP body object. In a fixture create request it is supplied once at the top level. The submission jobs use `resolveIdentity: true` in their job facets to show the lookup from `external_id` to `identity_id` at the API boundary. The IDs are equal only in fixture mode. Only `identity_id` is persisted and used in file paths.
- The [submit-preferences job](./events/baseline/identity-repository-api/submit-preferences.json) uses `mapping: "flatten-by-kind"` and `kindByGroup` to map `interests`, `wants`, `values`, and `boundaries` to `interest`, `want`, `value`, and `boundary` in `preferences[].kind`. The API object maps to the repository file by field name; the fixture repository assigns a preference ID on creation if one is absent.
- Keep only approved personas in the profile: each entry has a `name` matching a named preference affinity and one AI-generated `description` inferred from preferences. Synthetic fixtures assume approval for the names in legacy test context. The scripted narratives remain on disk for existing consumers but are not part of the lineage model. Do not copy persona values into lineage events.

## Write and review the events

1. **Separate baseline metadata from observed runs.** Use `DatasetEvent` for standalone dataset schemas. The baseline uses `urn:qff:lineage:baseline` as its producer and records when metadata was captured, not when a job executed.
2. **Use one event per JSON file.** For observed `RunEvent` files, reuse the job namespace/name and UUID `run.runId` across a run's events. Record `START` and the actual terminal outcome (`COMPLETE`, `FAIL`, or `ABORT`) when available. Put successful outputs on `COMPLETE` after they are committed; a rejected save does not produce a new preferences output.
3. **Keep the graph at dataset level.** Use dataset names such as `identity-preferences`, not per-person filenames or IDs. Do not include form values, preference text, contact data, credentials, or raw request bodies in names, facets, or event payloads. The viewer exposes the raw JSON and includes event files in its build.
4. **Check the graph in the viewer.** Select the dataset to inspect its schema. If run events are present, also verify that arrows point from inputs to jobs to outputs. Check for load warnings. The viewer checks the fields it needs, not full schema conformance.
5. **Record dataset schemas, not data.** Use the OpenLineage [Schema Dataset Facet](https://openlineage.io/docs/spec/facets/dataset-facets/schema/) in the dataset's `facets.schema`, with `_producer`, `_schemaURL`, and `fields`. Verify field names and types against the owning schema or checked-in fixture shapes. Leave unavailable schemas unrecorded.
