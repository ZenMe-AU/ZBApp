# First-take plan: canonical preference ontology

## Purpose and recommendation

Review of [the evolutionary semantic ontology proposal](evolutionary-semantic-ontology-inference.md) against the current QFF model indicates that it is implementable incrementally, but it introduces a new semantic layer. It should not be implemented by changing customer terminology or treating the existing interest-mode vectors as a complete ontology.

QFF is a standalone system. QFFViz is its data-analytics frontend, and currently also contains backend functionality such as file access and embedding refresh; this backend functionality should be runnable without a UI when hosted in serverless function apps. QFFViz may retain technical-analyst features for data cleansing and override editing, but it is not the production matcher or the canonical-modelling UI. Move matcher operations into a separate Node.js Azure Functions app with an API triggered by a requesting UI. That matcher must persist each transaction through the relevant data store and return the permitted result to its requester.

The consolidated QFF dataset is planned to use LanceDB, which is not multi-user. A dedicated QFF Repository function app must own and serialize access to the LanceDB files; QFFViz, the matcher app, and the future modelling UI must use its API rather than opening the database files directly. The ontology derivation service is a separate backend responsibility: design it for invocation by the QFF Modelling UI, with all persistent reads/writes delegated to the repository function app. These services and APIs are future components, not existing runtime dependencies. QFF currently stores preferences with definitions, kinds, persona-scoped signed affinities and embeddings in each identity's `*-properties.json`; its embedding refresh process uses Azure AI Foundry and caches vectors by model and text.

The existing [`interest-modes.json`](interest-modes.json) is a useful hand-authored reference model for *how someone engages with an interest* (for example, participating, spectating or visiting). These modes and their submodes are not subject-matter concepts such as visual arts or outdoor recreation, and their weighted-average vectors do not encode broader/narrower relationships. Keep them intact and distinct. Curated concepts or mode-related signals may inform the new model where appropriate, but must be deliberately mapped rather than automatically reinterpreted as ontology nodes.

**Recommendation:** begin with stable preference identity, a separately versioned and hand-editable canonical concept catalogue, and separately stored derived mappings. The planned active consolidated dataset is LanceDB, keyed by stable identity and preference IDs; keep authoritative identity data in its JSON files, outside that database, and store embedding vectors only in LanceDB. Add heuristic scoring and concept-based matching in stages. Treat automatic concept discovery as proposal generation; require review and approval before publishing catalogue changes.

## Existing capabilities and gaps

| Area | Current QFF behavior | Implication |
| --- | --- | --- |
| Source preferences | Preferences are embedded in each identity's properties JSON; there is no stable `preference_id`. Definitions are currently the embedding input. | Keep identity source data in JSON and add stable references without rewriting its meaning. |
| Embeddings | Current preference and kind vectors are in properties JSON; QFFViz refreshes them through Azure and maintains a text-keyed cache. | In the planned LanceDB-backed dataset, store vectors only in LanceDB as regenerable derived data. Reuse compatible provider/cache safeguards, and do not compare incompatible vector spaces. |
| Interest modes | Hand-authored modes contain editable submodes, definitions, weights and vectors; mode vectors are weighted averages. | Preserve this separate engagement-mode model. Do not mistake mode labels, submodes or averages for a concept hierarchy. |
| Matching | QFFViz has a developer-only match preview that compares preference and kind vectors and exposes both sides' evidence; it is not a production API. | Move matcher execution to the separate Node.js Azure Functions app. The matcher calls the repository API to read required data and write its transaction, then returns only the requesting party's permitted result. |
| Inference lifecycle | There is no canonical concept catalogue, mapping store, calibration dataset, review queue, clustering workflow or model-publication process. | These are new capabilities; autonomous evolution cannot be achieved by changing the existing embedding refresh alone. |
| Operational scope | The available QFF data consists of six synthetic identities; the UI is a development/analysis tool. | These are simulated, non-production records and may be updated by agents as needed. Validate behavior on fixtures, but do not infer production-scale quality or calibrated probabilities from them. |

## Target data boundaries

Keep source, curated and derived data distinguishable, with storage roles explicit:

1. **Identity source:** each identity's authoritative JSON files, including its stable identity and preference IDs, original preferences, persona memberships and affinities. Identity source data does not live in the consolidated database and is never replaced by inferred labels.
2. **Curated model:** stable concept IDs, human-authored labels and descriptions, examples/exclusions, explicit parent relationships, status/version, and human-authored mapping guidance or overrides. The active consolidated model is planned to use LanceDB.
3. **Derived results:** semantic envelopes, candidate/accepted mappings, score and provenance metadata, and version references are stored in the LanceDB-backed consolidated dataset and linked to identity JSON by stable IDs. Embedding vectors are stored only in LanceDB, not duplicated in identity files. Vectors are regenerable derived state, not authoritative source.

Do not add inferred mappings to identity source files or `interest-modes.json`. Develop the LanceDB-backed dataset when the consolidated-data component is built; it is not an existing QFF dependency and is not an immediate implementation task. In the pre-hosted phase, commit the LanceDB files to the QFF repository. When QFF becomes hosted, move the database out of the repository and back it up independently. For production, store and secure each identity's source data independently from other identities, and secure and encrypt LanceDB for QFF-only use. These are future deployment requirements; the current simulation data is not production data.

### Service boundaries

- **QFFViz:** analytics frontend for technical analysts. Keep analytics and visualization; allow scoped data cleansing and override editing where useful. Separate its backend operations from browser/UI startup so they can be called headlessly from serverless functions. QFFViz may call the matcher API for an analysis/demo request, but must not execute matcher logic or own match transactions.
- **QFF Repository function app:** the only runtime service that opens and mutates the non-multi-user LanceDB dataset. Provide the API needed for authorized reads/writes, serialize access, and persist the canonical catalogue, derived mapping records, embedding vectors, and matcher transactions in the appropriate tables. Identity source JSON remains outside LanceDB and is linked by stable IDs.
- **Matcher function app:** a separate Node.js Azure Functions app with request/response APIs. The requesting UI (QFFViz or another authorized client) triggers a match; the service obtains the data it needs through the repository API, computes the result, writes a transaction through that API, and returns the requestor-specific result. Do not bypass repository ownership by opening LanceDB directly.
- **Ontology derivation backend:** expose derivation runs to the modelling UI through an API (initially deployable as a serverless function app). It generates semantic representations and mappings, records run/provenance data through the repository API, and returns status/results. Keep execution out of the browser and the UI process.
- **QFF Modelling UI:** a separate SPA using an API boundary for its server/client operations. It calls modelling and matcher services for work and the QFF Repository function app for dataset operations. Do not make it a multi-user direct LanceDB client.

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
- Specify the QFF Repository function API as the only runtime boundary to the non-multi-user LanceDB files, including serialized writes, transaction semantics, request identity, error handling, and version checks.
- Define the authorized write path for customer-confirmed preferences to the owning identity's source JSON, distinct from analyst mapping overrides and distinct from LanceDB transaction writes.
- Define APIs and ownership for the ontology derivation backend, matcher Azure Functions app, QFFViz analytics frontend, and future QFF Modelling UI. Keep compute out of browsers and avoid direct LanceDB access from clients or other services.
- Adopt the distinct `embedding_similarity`, heuristic `confidence_score`, and calibrated `probability` terms above. Until labelled review data supports validated calibration, emit only the first two and do not call either a probability.
- Define minimal fixture-based acceptance checks for concept retrieval, hierarchy paths, human overrides, customer confirmation, match privacy, and transaction persistence before implementing the services.

### Phase 1 — Local workspace and QFF Repository foundation

- Create local workspace structure for versioned canonical-model definitions/bootstrap data and the QFF Repository function app. Suggested starting directories are `CanonicalModels/` and `QFFRepository/`; keep names adjustable until the workspace layout is reviewed.
- Define a clear import/export and authority rule between version-controlled canonical-model inputs and the active consolidated LanceDB dataset; avoid maintaining two independently editable sources of truth.
- Create the initial QFF Repository using LanceDB and commit its local data files to the QFF Git repository during this pre-hosted phase. Include the repository function app/API that exclusively opens and serializes access to those files.
- Add the minimal catalogue and derived-data schema/indexes required for stable IDs, concept versions, mapping records, embedding vectors, processing runs, and transactions. Do not place identity source records in LanceDB.
- Backfill stable identity and preference IDs in the simulated identity JSON files without changing preference text, kinds, affinities or persona membership. Preserve these files as the source of truth.
- Verify repository API operations and backup/restore or rebuild from tracked inputs. The future hosted deployment moves LanceDB outside Git with independent backup; production additionally secures identity data independently and encrypts/restricts the QFF-only LanceDB service.

### Phase 2 — Design, simulate, and implement derivation and matcher services

This phase depends on the Phase 1 QFF Repository API and LanceDB schema.

- **Design:** Specify a contextual semantic envelope from the source keyword and definition; keep persona names and affinity out of the primary semantic embedding. Define candidate retrieval, typed relationship paths, human overrides, provenance and service transaction contracts.
- **Simulate:** Run the proposed derivation and matching rules over the six non-production identities and additional synthetic edge cases. Inspect correct/incorrect candidates, hierarchy effects, confidence ranking, same/different model versions, rejected mappings and source-preservation behavior. Revise the design before building a service.
- **Implement derivation:** Add backend code/API to generate semantic representations, use `embedding_similarity` for candidate retrieval, calculate only versioned heuristic `confidence_score` values, and persist mappings, vector data, provenance and run records through the QFF Repository API. Keep embedding vectors only in LanceDB.
- **Implement matcher:** Move matcher execution out of QFFViz into a separate Node.js Azure Functions app. The requesting UI triggers its API; the service obtains permitted data through QFF Repository, calculates explainable concept-based matches, writes the match transaction/results through that repository API, and returns the requestor-specific result.
- Preserve the direct-preference matcher as a simulation/comparison baseline during validation. Keep persona affinity and preference kind distinct from canonical concept membership. Never expose counterpart keywords, affinities, or uniquely identifying inferred mappings in a per-party response.
- Implement customer confirmation as a separate explicit action/API: only a customer's selection can add an inferred preference to their source identity JSON, linked to the generating mapping and confirmation provenance. Analyst approval of a concept mapping is not customer confirmation.
- Make backend operations invokable without a UI and suitable for serverless execution. Use deterministic fixture tests and cached embeddings so core validation does not require live Azure calls.

### Phase 3 — QFF Modelling UI MVP

Build a separate Node.js SPA with an API boundary between client and server. UI actions call the ontology derivation backend for execution and the QFF Repository function app for dataset reads/writes; no UI process accesses LanceDB directly. Match requests may be initiated by QFFViz or another authorized requesting UI and are handled by the Matcher function app. Keep the API boundary so server-side operations can later move into Azure Functions without redesigning the client. The MVP should deliver only the following focused pages:

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
- Treat identity JSON as authoritative; preserve original source fields. Keep vectors and derived mappings in LanceDB through the QFF Repository API. Never open or mutate LanceDB directly from QFFViz, the Modelling UI, or the Matcher app.
- Keep QFFViz analytics and technical-analyst cleansing/override features separate from matcher execution and canonical-modelling workflows. A human mapping override is not customer confirmation.
- Keep the SPA/API boundary explicit, backend tasks headless and serverless-compatible, and all database writes behind repository transactions. Preserve the single-owner/serialized LanceDB access contract.
- Use AG Grid for tabular reporting/editing and Plotly for graphs; keep visualizations focused and avoid adding unrelated charts to a page.
- Add focused tests for service schemas, stable IDs, persistence, provenance, score terminology, privacy and failure/rollback paths. Prefer synthetic fixtures/cached embeddings; do not require production data or live model calls for routine tests.
- Label `embedding_similarity` and heuristic `confidence_score` accurately. Do not emit or claim calibrated `probability` without a validated held-out calibration model and its metadata.
- Keep changes minimal, document architectural decisions that are implemented, and leave future-phase features as explicit follow-up work rather than speculative abstractions.

## Validation and release gates

- **Source and ID integrity:** identity/preference IDs are stable; migrations preserve original keywords, definitions, kinds, affinities and persona memberships.
- **Repository ownership:** only the QFF Repository function app accesses LanceDB at runtime; concurrent requests are serialized or safely rejected, and transaction writes are atomic/idempotent as specified.
- **Hand-crafted control:** curated mappings and overrides survive refresh/reprocessing; rejection is not silently undone; customer-confirmed preferences are explicitly selected, owner-scoped and linked to provenance.
- **Schema and provenance:** invalid IDs/references/relationships, stale vectors, incompatible embedding versions and missing score/model/taxonomy metadata are rejected or marked unusable.
- **Semantic behavior:** synthetic reviewed pairs test paraphrases, specificity and valid broader concepts; unrelated meanings and excluded concepts must not become confident matches.
- **Uncertainty:** `embedding_similarity` and heuristic `confidence_score` remain separate and never appear as calibrated probability. Any later `probability` requires held-out calibration evidence and model/dataset/version metadata.
- **Matcher behavior and privacy:** compare concept matching with the direct-preference baseline; verify the matcher persists transactions and returns results to the requester while each party's output excludes the counterpart's preference details and any inferable sensitive evidence.
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

Deliver **Phase 0 and Phase 1** first: agree the service/data contracts, create the workspace folders, seed stable IDs in simulated identity JSON, and establish the Git-tracked LanceDB repository behind its function API. Then design and simulate Phase 2 before implementing the derivation and matcher services. Build only the Phase 3 MVP pages needed to inspect concepts, review mappings, trigger backend runs and understand heuristic score distributions. Use Phase 4 for enhancements after fail-fast evaluation; defer customer-facing confirmation UI, calibrated probabilities and hosted production controls until their dependencies and data governance are ready.
