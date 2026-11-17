# First-take plan: canonical preference ontology

## Purpose and recommendation

Review of [the evolutionary semantic ontology proposal](evolutionary-semantic-ontology-inference.md) against the current QFF model indicates that it is implementable incrementally, but it introduces a new semantic layer. It should not be implemented by changing customer terminology or treating the existing interest-mode vectors as a complete ontology.

QFF is a standalone system. QFFViz is its data-analytics frontend, and currently also contains backend functionality such as file access and embedding refresh; this backend functionality should be runnable without a UI when hosted in serverless function apps. QFFViz may retain technical-analyst features for data cleansing and override editing, but it is not the production matcher or the canonical-modelling UI. Move matcher operations into a separate Node.js Azure Functions app with an API triggered by a requesting UI. That matcher must persist each transaction through the relevant data store and return the permitted result to its requester.

The consolidated QFF dataset is planned to use LanceDB, which is not multi-user. A dedicated QFF Repository function app must own and serialize access to LanceDB; it stores QFF-owned concepts, derived records, vector data and transactions, but is not the source of truth for identity-owned data. Identity data therefore needs a separate Identity Repository function app, implemented in TypeScript on Node.js/Azure Functions, as the API boundary for identity files shared by multiple frontends and backends. In development it will operate on the existing identity JSON files tracked in this Git repository; future deployed versions can replace that file-hosting adapter without changing callers. QFFViz, the matcher, modelling UI and derivation backend use the appropriate repository APIs rather than directly accessing another service's data store.

Phase 1 will remove embeddings and embedding-only metadata/vectors from identity files and establish persistent identity and preference IDs. Phase 2 will derive the required preference/kind embeddings into the QFF Repository's LanceDB dataset, keyed by those IDs. These services and APIs are future components, not existing runtime dependencies. Today QFF stores preferences with definitions, kinds, persona-scoped signed affinities and embeddings in each identity's `*-properties.json`; its embedding refresh process uses Azure AI Foundry and caches vectors by model and text.

The existing [`interest-modes.json`](interest-modes.json) is a useful hand-authored reference model for *how someone engages with an interest* (for example, participating, spectating or visiting). These modes and their submodes are not subject-matter concepts such as visual arts or outdoor recreation, and their weighted-average vectors do not encode broader/narrower relationships. Keep them intact and distinct. Curated concepts or mode-related signals may inform the new model where appropriate, but must be deliberately mapped rather than automatically reinterpreted as ontology nodes.

**Recommendation:** begin with persistent identity/preference IDs, separate Identity and QFF Repository APIs, a separately versioned and hand-editable canonical concept catalogue, and separately stored derived mappings. Keep authoritative identity data in its JSON files behind the Identity Repository, outside LanceDB; store regenerated embedding vectors and QFF-owned consolidated/derived data only in the QFF Repository's LanceDB dataset. Add heuristic scoring and concept-based matching in stages. Treat automatic concept discovery as proposal generation; require review and approval before publishing catalogue changes.

## Existing capabilities and gaps

| Area | Current QFF behavior | Implication |
| --- | --- | --- |
| Source preferences | Preferences are in each identity's properties JSON; there is no stable `preference_id`. Definitions are currently the embedding input. | Keep identity source data in JSON behind an Identity Repository and add persistent IDs without rewriting its meaning. |
| Embeddings | Current preference and kind vectors are in properties JSON; QFFViz refreshes them through Azure and maintains a text-keyed cache. | Phase 1 removes embeddings from identity files; Phase 2 rebuilds preference/kind vectors as regenerable derived data in QFF Repository LanceDB. Reuse compatible provider/cache safeguards and do not compare incompatible vector spaces. |
| Interest modes | Hand-authored modes contain editable submodes, definitions, weights and vectors; mode vectors are weighted averages. | Preserve this separate engagement-mode model. Do not mistake mode labels, submodes or averages for a concept hierarchy. |
| Matching | QFFViz has a developer-only match preview that compares preference and kind vectors and exposes both sides' evidence; it is not a production API. | Move matcher execution to the separate Node.js Azure Functions app. The matcher calls the repository API to read required data and write its transaction, then returns only the requesting party's permitted result. |
| Inference lifecycle | There is no canonical concept catalogue, mapping store, calibration dataset, review queue, clustering workflow or model-publication process. | These are new capabilities; autonomous evolution cannot be achieved by changing the existing embedding refresh alone. |
| Operational scope | The available QFF data consists of six synthetic identities; the UI is a development/analysis tool. | These are simulated, non-production records and may be updated by agents as needed. Validate behavior on fixtures, but do not infer production-scale quality or calibrated probabilities from them. |

## Target data boundaries

Keep source, curated and derived data distinguishable, with storage roles explicit:

1. **Identity source:** each identity's authoritative JSON files, including persistent identity/preference IDs, original preferences, persona memberships and affinities. The Identity Repository owns access and writes to these files; they are not stored in the consolidated QFF database and are never replaced by inferred labels.
2. **QFF-owned model and consolidated data:** canonical concepts, model versions, explicit curated mapping guidance/overrides, aggregate preference references, derived mappings and match transactions. The QFF Repository owns this active LanceDB dataset. It may index or aggregate identity-owned preferences by stable identity/preference IDs but does not become their source of truth.
3. **Derived vectors and results:** embeddings, semantic envelopes, candidate/accepted mappings, score and provenance metadata, and version references live in the QFF Repository dataset and link back to identity JSON via persistent IDs. Identity JSON does not retain embedding vectors or embedding-only metadata after Phase 1. Vectors are regenerable derived state, not authoritative source.

Do not add inferred mappings to identity source files or `interest-modes.json`. Develop the LanceDB-backed dataset when the consolidated-data component is built; it is not an existing QFF dependency and is not an immediate implementation task. In the pre-hosted phase, commit the QFF Repository LanceDB files and development identity JSON files to the QFF Git repository. The Identity Repository must access identity files through its API even when its development adapter uses those tracked files. When QFF becomes hosted, replace the identity file adapter with alternative hosting, move LanceDB outside Git and back it up independently. For production, secure identity source stores independently from each other, and secure/encrypt LanceDB for QFF-only use. These are future deployment requirements; the current simulation data is not production data.

### Service boundaries

- **QFFViz:** analytics frontend for technical analysts. Keep analytics and visualization; allow scoped data cleansing and override editing where useful. Separate its backend operations from browser/UI startup so they can be called headlessly from serverless functions. QFFViz may call the matcher API for an analysis/demo request, but must not execute matcher logic or own match transactions.
- **Identity Repository function app:** a TypeScript Node.js Azure Functions app and the only service boundary for identity-owned source files. It provides identity/preference reads and authorized edits to QFFViz, matcher, modelling UI and derivation services. Its development adapter uses the existing JSON files in Git; a deployed version can switch to alternative file hosting. It removes embedding vectors and embedding-only metadata from identity JSON as part of Phase 1.
- **QFF Repository function app:** the only runtime service that opens and mutates the non-multi-user LanceDB dataset. It provides authorized reads/writes and serialized access for QFF-owned concepts, aggregate preference references, derived mappings, embeddings, processing runs and matcher transactions. It may index or aggregate identity-owned preferences by persistent IDs, but cannot own or override their source truth.
- **Matcher function app:** a separate Node.js Azure Functions app with request/response APIs. The requesting UI (QFFViz or another authorized client) triggers a match; the service obtains identity-owned source fields through Identity Repository and QFF-owned aggregates/vectors through QFF Repository, computes the result, writes its transaction through QFF Repository, and returns the requestor-specific result. Do not bypass either repository boundary.
- **Ontology derivation backend:** expose derivation runs to the modelling UI through an API (initially deployable as a serverless function app). It reads source preferences through Identity Repository, generates semantic representations and mappings, and writes QFF-owned derived records/vectors and run provenance through QFF Repository. Keep execution out of the browser and the UI process.
- **QFF Modelling UI:** a separate SPA using an API boundary for its server/client operations. It calls modelling and matcher services for execution, Identity Repository for identity-owned data, and QFF Repository for QFF-owned consolidated data. Do not make it a multi-user direct LanceDB client.

### Curated guidance and inferred results

Hand-crafted concepts, relationships and corrections are first-class model inputs. The design should support, at minimum:

- curated/approved concepts and explicitly human-authored parent or related-concept links;
- aliases, examples, exclusions and human-confirmed mappings where useful;
- an explicit human override or exclusion for an individual mapping, kept distinguishable from model evidence;
- proposed versus approved versus retired concept states; and
- version history so a later inference run cannot silently erase human changes.

Define precedence before implementation. At minimum, an explicit human override must take precedence over a generated candidate; a rejection must not be reintroduced as accepted by automatic inference. Source preference text remains unchanged regardless of the override. Changes to curated semantic text invalidate only its derived embedding, following the existing QFF text/vector invalidation rules.

### Customer confirmation of inferred preferences

Inference alone must never promote a candidate to an explicit customer preference. Provide a feedback loop in which a customer can select an inferred preference they agree with. On confirmation, record that preference as an explicit preference in the identity's source JSON, linked to the inference that prompted it and retaining its confirmation provenance; do not overwrite the original source preference. Unselected or rejected candidates remain derived inference/review data and must not be represented as customer-endorsed.

## Score and probability terminology

Use the attached probability clarification's terms consistently:

| Term | Meaning and use |
| --- | --- |
| `embedding_similarity` | Similarity between vectors; use to retrieve and rank candidates, not as a correctness likelihood. |
| `confidence_score` | Uncalibrated score from one or more signals; use for ranking, thresholds and review prioritization, and label it heuristic. |
| `probability` | Empirically calibrated mapping-correctness estimate; use only after calibration has been validated against held-out labelled review outcomes. |

Keep `embedding_similarity` and `confidence_score` separate in derived mappings, with a versioned score method/version, embedding model and taxonomy version. Example weights or operational thresholds are heuristics, not probability bands; never convert a score to a percentage likelihood or present a `0.84` heuristic score as an 84% chance. A future calibrated probability must identify its calibration model, labelled dataset version, relationship type and taxonomy version, and calibration must be evaluated using suitable held-out measures such as reliability curves and Brier score.

## Proposed implementation phases

The phases are intentionally incremental. Start with the local simulated dataset, validate each service boundary and modeling decision before expanding scope, and defer production hosting and non-MVP features. The implementation sequence is:

```text
local workspace and LanceDB repository
        ↓
semantic derivation and matcher services (design → simulate → implement)
        ↓
QFF Modelling UI MVP (SPA → APIs → service execution)
        ↓
modelling, review and reporting enhancements
```

### Phase 0 — Decisions and contracts

- Confirm stable identity/preference ID generation, backfill, collision handling and compatibility for existing JSON. IDs must survive edits to wording, definitions, and persona memberships.
- Define the concept, relationship, mapping, provenance, status and version schemas, including how hand-authored concepts, analyst overrides, model suggestions, and customer-confirmed preferences differ.
- Specify separate repository APIs: Identity Repository exclusively reads/writes identity-owned source files; QFF Repository exclusively accesses QFF-owned LanceDB records. Define authorization, error handling, transaction/version checks and serialized LanceDB writes.
- Define the authorized Identity Repository write path for customer-confirmed preferences and analyst edits to identity-owned source fields, distinct from QFF Repository mapping overrides and match transactions.
- Define APIs and ownership for the ontology derivation backend, matcher Azure Functions app, QFFViz analytics frontend, future QFF Modelling UI, Identity Repository and QFF Repository. Keep compute out of browsers and prevent direct data-store access across boundaries.
- Adopt the distinct `embedding_similarity`, heuristic `confidence_score`, and calibrated `probability` terms above. Until labelled review data supports validated calibration, emit only the first two and do not call either a probability.
- Define minimal fixture-based acceptance checks for concept retrieval, hierarchy paths, human overrides, customer confirmation, match privacy, and transaction persistence before implementing the services.

### Phase 1 — Local workspace, Identity Repository and QFF Repository foundations

- Create local workspace structure for versioned canonical-model definitions/bootstrap data and both repository function apps. Suggested starting directories are `CanonicalModels/`, `IdentityRepository/` and `QFFRepository/`; keep names adjustable until the workspace layout is reviewed.
- Create the Identity Repository as a TypeScript/Node.js Azure Functions app, following the workspace's function-app design standards. Define its API for identity-owned JSON reads and authorized writes. In development, have the repository adapter read/write the existing identity files tracked in the QFF Git repository; keep the API independent of this storage choice so a future deployed version can use alternative file hosting.
- Route QFFViz and future services through the Identity Repository rather than allowing each frontend/backend to access identity files directly. Preserve the current file layout as the development persistence implementation, not as the long-term cross-service API.
- Establish persistent `identity_id` and `preference_id` values in the source JSON. Preserve already valid identity IDs, assign stable preference IDs to existing preferences, and ensure IDs do not change when keywords, definitions or persona memberships are edited.
- Remove embedding vectors and embedding-only model/vector metadata (including preference embeddings, kind vectors and identity-level embedding model metadata where no longer needed) from identity-owned JSON. Phase 2 will regenerate those vectors in the QFF Repository; preserve the semantic source fields and persona affinities.
- Define a clear import/export and authority rule between version-controlled canonical-model inputs and the active consolidated LanceDB dataset; avoid maintaining two independently editable sources of truth.
- Create the initial QFF Repository using LanceDB and commit its local data files to the QFF Git repository during this pre-hosted phase. Include the QFF Repository function app/API that exclusively opens and serializes access to those files.
- Add the minimal QFF-owned catalogue and derived-data schema/indexes for persistent identity/preference references, concept versions, aggregate preference records, mappings, vectors, processing runs and transactions. Do not put authoritative identity source data in LanceDB.
- Verify both repository APIs: the Identity Repository operates on tracked development JSON, while the QFF Repository persists only QFF-owned data and aggregates keyed by stable identity/preference IDs. Test backup/restore or rebuild for the LanceDB dataset and compatibility with future alternative identity file hosting. Future hosted deployment moves identity files to alternative hosting and LanceDB outside Git with independent backup; production additionally secures identity data independently and encrypts/restricts the QFF-only LanceDB service.

### Phase 2 — Design, simulate, and implement derivation and matcher services

This phase depends on the Phase 1 Identity Repository API, QFF Repository API and LanceDB schema.

- **Design:** Specify a contextual semantic envelope from the source keyword and definition; keep persona names and affinity out of the primary semantic embedding. Define candidate retrieval, typed relationship paths, human overrides, provenance and service transaction contracts.
- **Simulate:** Run the proposed derivation and matching rules over the six non-production identities and additional synthetic edge cases. Inspect correct/incorrect candidates, hierarchy effects, confidence ranking, same/different model versions, rejected mappings and source-preservation behavior. Revise the design before building a service.
- **Implement derivation:** Add backend code/API to read identity source preferences through Identity Repository; rebuild preference and kind embeddings into QFF Repository LanceDB; use `embedding_similarity` for candidate retrieval; calculate only versioned heuristic `confidence_score` values; and persist mappings, vectors, provenance and run records through QFF Repository. Identity source JSON remains vector-free.
- **Implement matcher:** Move matcher execution out of QFFViz into a separate Node.js Azure Functions app. The requesting UI triggers its API; the service reads identity-owned source fields through Identity Repository and QFF-owned aggregate/vector data through QFF Repository, calculates explainable concept-based matches, writes the match transaction/results through QFF Repository, and returns the requestor-specific result.
- Preserve the direct-preference matcher as a simulation/comparison baseline during validation. Keep persona affinity and preference kind distinct from canonical concept membership. Never expose counterpart keywords, affinities, or uniquely identifying inferred mappings in a per-party response.
- Implement customer confirmation as a separate explicit action/API: only a customer's selection can add an inferred preference to their source identity JSON through Identity Repository, linked to the generating mapping and confirmation provenance. Analyst approval of a concept mapping is not customer confirmation.
- Make backend operations invokable without a UI and suitable for serverless execution. Use deterministic fixture tests and cached embeddings so core validation does not require live Azure calls.

### Phase 3 — QFF Modelling UI MVP

Build a separate Node.js SPA with an API boundary between client and server. UI actions call the ontology derivation backend for execution, Identity Repository for identity-owned JSON, and QFF Repository for QFF-owned dataset reads/writes; no UI process accesses identity files or LanceDB directly. Match requests may be initiated by QFFViz or another authorized requesting UI and are handled by the Matcher function app. Keep the API boundary so server-side operations can later move into Azure Functions without redesigning the client. The MVP should deliver only the following focused pages:

1. **Model overview dashboard:** Show active catalogue/model versions, last derivation run, counts of mapped/review/unmatched preferences and recent run/transaction status. Use a compact AG Grid summary/history table; this is the one dashboard page and may combine summary widgets.
2. **Canonical concept editor:** Use AG Grid for technical modelers to create/edit labels, definitions, aliases, examples, exclusions, typed parent relationships and lifecycle status. Validate references and version changes; preserve a history of curated edits and mapping overrides.
3. **Mapping review:** Use AG Grid to filter/sort candidate, low-confidence, rejected and unmatched records. Show source identity/preference ID, candidate concept, relationship, `embedding_similarity`, heuristic `confidence_score`, score method/version, concise evidence and taxonomy version. Permit analyst mapping override/accept/reject actions while clearly distinguishing these from customer confirmation.
4. **Derivation runs:** Let an analyst start a bounded derivation run and select the intended source/catalogue/model versions. Show run progress, completion/failure and a concise AG Grid result/error table returned by the backend; do not execute embeddings or clustering in the browser.
5. **Score distribution report:** Use one Plotly visualization to explore candidate similarity/confidence distributions and threshold effects. Label all uncalibrated values as heuristic scores, never probabilities.

Use the QFF reporting standard: AG Grid for tabular data and editing, Plotly for graphs. Keep each non-dashboard page focused on one primary visualization; add separate pages rather than combining unrelated graphs and tables into one dense view. Scope data-cleansing and override controls to technical analysts. The Modeling UI is not a customer-facing preference-confirmation UI.

### Phase 4 — Modelling UI and controlled-evolution enhancements

Add these capabilities only after the MVP has been exercised on simulated data and the core service/API boundaries are stable:

- Candidate-cluster and unmatched-pattern review, with a separate Plotly cluster/report page and AG Grid candidate-review page. Clusters propose concepts; they never publish concepts automatically.
- Catalogue version history and compare/merge/split workflows, batch review tools, stronger provenance inspection, reversible analyst overrides, and impact analysis before remapping.
- Additional single-purpose Plotly reports for changes over model versions, concept coverage and mapping quality. If sufficient reviewed labels exist, add calibration diagnostics (e.g. reliability curves and Brier score) before considering any `probability` output.
- Recompute affected mappings when the embedding model, scoring method or taxonomy changes, retaining prior versions and explaining why results changed.
- Integrate customer-confirmation flows through an appropriate customer-facing UI/API when that product surface exists. Confirmation must write only the selected preference to its owner's source JSON with provenance; the technical analyst UI may inspect aggregate confirmation status but must not impersonate customer consent.
- Defer production identity isolation, hosted LanceDB deployment, independent backups, encryption and operational scaling until the hosted-solution phase. Do not make the simulated Git-tracked repository appear production-secure.

## Coding-agent guidance (including Ponytail agents)

- Work only on the current phase's smallest useful increment. First inspect the relevant workspace/API/data contracts, then implement a thin end-to-end slice, simulate it, validate it, and iterate; do not build all planned services or UI pages in one pass.
- Treat identity JSON as authoritative; preserve original source fields and persistent IDs. Use Identity Repository APIs for identity-owned reads/writes and QFF Repository APIs for QFF-owned consolidated data. Keep vectors and derived mappings in LanceDB; never open identity files or LanceDB directly from QFFViz, the Modelling UI, derivation backend or Matcher app.
- Keep QFFViz analytics and technical-analyst cleansing/override features separate from matcher execution and canonical-modelling workflows. Access identity-owned data through Identity Repository and QFF-owned data through QFF Repository. A human mapping override is not customer confirmation.
- Keep the SPA/API boundary explicit and backend tasks headless/serverless-compatible. Route identity-owned source writes through Identity Repository and QFF-owned LanceDB writes through QFF Repository; preserve the single-owner/serialized LanceDB access contract.
- Use AG Grid for tabular reporting/editing and Plotly for graphs; keep visualizations focused and avoid adding unrelated charts to a page.
- Add focused tests for service schemas, stable IDs, persistence, provenance, score terminology, privacy and failure/rollback paths. Prefer synthetic fixtures/cached embeddings; do not require production data or live model calls for routine tests.
- Label `embedding_similarity` and heuristic `confidence_score` accurately. Do not emit or claim calibrated `probability` without a validated held-out calibration model and its metadata.
- Keep changes minimal, document architectural decisions that are implemented, and leave future-phase features as explicit follow-up work rather than speculative abstractions.

## Validation and release gates

- **Source and ID integrity:** identity/preference IDs are stable; migrations preserve original keywords, definitions, kinds, affinities and persona memberships.
- **Repository ownership:** only Identity Repository accesses identity-owned files through its API; only QFF Repository accesses QFF-owned LanceDB at runtime. Concurrent LanceDB requests are serialized or safely rejected, and transaction writes are atomic/idempotent as specified.
- **Embedding migration:** Phase 1 removes preference embeddings, kind vectors and embedding-only model metadata from identity JSON without changing source preference fields; Phase 2 rebuilds required vectors in LanceDB and verifies they link to the correct persistent IDs.
- **Hand-crafted control:** curated mappings and overrides survive refresh/reprocessing; rejection is not silently undone; customer-confirmed preferences are explicitly selected, owner-scoped and linked to provenance.
- **Schema and provenance:** invalid IDs/references/relationships, stale vectors, incompatible embedding versions and missing score/model/taxonomy metadata are rejected or marked unusable.
- **Semantic behavior:** synthetic reviewed pairs test paraphrases, specificity and valid broader concepts; unrelated meanings and excluded concepts must not become confident matches.
- **Uncertainty:** `embedding_similarity` and heuristic `confidence_score` remain separate and never appear as calibrated probability. Any later `probability` requires held-out calibration evidence and model/dataset/version metadata.
- **Matcher behavior and privacy:** compare concept matching with the direct-preference baseline; verify the matcher reads through both repositories, persists QFF-owned transactions and returns results to the requester while each party's output excludes the counterpart's preference details and any inferable sensitive evidence.
- **UI MVP:** verify each listed page uses the correct backend/repository APIs, AG Grid for tabular operations and Plotly for the score-distribution graph; verify browser code cannot access the LanceDB file directly.
- **Operational behavior:** run backend tests without a UI and without Azure credentials where cached data allows; verify failure status, retry/rollback, reproducibility and rebuild/restore from tracked inputs.

## Main risks and open questions

1. **Terminology/model mismatch:** interest modes are manually authored engagement behaviors, not a hierarchy of subject-matter concepts. Keep the two models separate.
2. **False precision:** neither embedding similarity nor an uncalibrated weighted score is probability; synthetic identities cannot calibrate real-world correctness.
3. **Single-user database:** LanceDB is not multi-user; bypassing the QFF Repository function app creates contention or corruption risk. All services and UIs must use the repository API.
4. **Service boundary/security:** define authentication, authorization, caller-scoped results, transaction ownership and identity-source access before connecting future UIs or production data.
5. **MVP scope:** avoid building advanced clustering, calibration, all reporting, and complete analyst workflows before testing the end-to-end core.
6. **Hosted deployment:** Git-tracked LanceDB files and simulated identity fixtures are pre-hosted development choices only. Production requires independently secured identity stores and a QFF-only encrypted hosted repository with separate backup.

## Recommended first implementation milestone

Deliver **Phase 0 and Phase 1** first: agree the service/data contracts; create canonical-model, Identity Repository and QFF Repository workspace structure; establish persistent IDs and the Identity Repository API over the existing Git-tracked identity JSON; remove embeddings from that source JSON; and establish the Git-tracked LanceDB QFF Repository behind its function API. Then design and simulate Phase 2 before rebuilding embeddings and implementing derivation and matcher services. Build only the Phase 3 MVP pages needed to inspect concepts, review mappings, trigger backend runs and understand heuristic score distributions. Use Phase 4 for enhancements after fail-fast evaluation; defer customer-facing confirmation UI, calibrated probabilities and hosted production controls until their dependencies and data governance are ready.
