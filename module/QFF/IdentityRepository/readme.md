# Identity Repository

## Overview

The Identity Repository is the API for identity-owned source records. Phase 1 is implemented for local development with synthetic profiles. Production sign-in, authorization, and preference confirmation are planned in the [canonical ontology implementation plan](../plan-canonical-ontology.md).

## Business context

Customers control their own preferences. Analysts need authorized cross-profile reads for analysis and data cleansing, but their edits and overrides do not count as customer approval. The diagram shows the current local flow.

```mermaid
flowchart LR
  Analyst["Analyst using synthetic data"] -->|View profiles| Viz["QFFViz"]
  Viz -->|Read profiles| Identity["Identity Repository API"]
  Identity -->|Read or update source JSON| Files["Identity fixtures"]
```

| From | To | Interaction |
| --- | --- | --- |
| Analyst using synthetic data | QFFViz | View fixture profiles for development and analysis. |
| QFFViz | Identity Repository API | List and read profiles through the local development adapter. Legacy saves are disabled in QFFViz. |
| Identity Repository API | Identity fixtures | Read the three source files and optional test context; apply revision-checked preference edits requested through the API. |

## Functional Requirements

| Phase 1 API | Behavior |
| --- | --- |
| `GET /api/v1/profiles` | List available fixture selectors as `profile_ids`. Each is also a simulated external ID. |
| `GET /api/v1/profiles/{externalId}` | Resolve the fixture ID and return identity, relations, preferences and the preference revision. Include `profile.personas` only when optional test context is present, for compatibility with the scripted baseline. |
| `POST /api/v1/profiles` | Create a fixture from a top-level `external_id` and `identity`, `relations`, and `properties` objects. The API sets each document's internal `identity_id`; callers need not supply it. An optional `personas` document is written as test context. Missing preference GUIDs are assigned; duplicate profile IDs are rejected. |
| `PUT /api/v1/profiles/{externalId}/preferences/{preferenceId}` | Resolve the fixture ID and update an existing preference's keyword, definition, kind, and persona affinities. Supply the revision in `If-Match`; reload on `412` before retrying. |

Planned: let customers approve suggested wording in [QFFIdentity](../QFFIdentity/readme.md). Approval creates a new preference and preserves the original.

## Application Architecture

A TypeScript/Node.js Azure Functions app serves [tracked JSON fixtures](../Identities/). The resolved internal `identity_id` selects `Identities/<id>/` and the `<id>-*.json` files in it. The external ID is not a field in those documents. `*-test-context.json` is optional and is not part of the preference revision. Derived vectors and mappings belong to the [QFF Repository](../QFFRepository/readme.md), not the identity files.

Production will resolve a verified, provider-scoped login ID (Entra ID or social login) to a separate internal `identity_id` and enforce access through the API. Fixture mode uses the same value for both IDs without authenticating anyone.

## Technical Guidance

- With Azure Functions Core Tools installed, set `FUNCTIONS_WORKER_RUNTIME=node` and `QFF_FIXTURE_MODE=1` in your shell. From this folder, run `pnpm start` (port 7181, loopback only) or `pnpm test` for the repository tests.
- Run `pnpm run migrate:fixtures` to assign missing preference GUIDs and remove legacy vector fields. It is safe to rerun on the synthetic fixtures.

## Design decisions

- **Stable source IDs:** Preserve valid internal `identity_id` values and assign each preference an opaque, immutable GUID. Do not derive preference IDs from wording or array position; derived records link by ID without copying the authoritative source.
- **Identity-wide scope:** An affinity entry with `"persona": ""` applies to the identity without requiring a named persona or test context.
- **Identity resolution:** Only fixture mode treats the caller-supplied external ID as the internal ID. The production resolver must use verified login claims, not an ID supplied in the request body or path as proof of identity.
- **Revision-checked writes:** Check the revision under a per-file lock and replace the file atomically so concurrent saves cannot silently overwrite one another. Reject stale revisions.
- **Derived-data invalidation:** Source edits and deletions make QFF-derived data stale. Reconcile it during a full refresh rather than tracking stale state on every derived record or requiring immediate propagation.
