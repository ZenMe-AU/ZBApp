# First-take plan: canonical preference ontology

## Purpose and recommendation

Review of [the evolutionary semantic ontology proposal](evolutionary-semantic-ontology-inference.md) against the current QFF model indicates that it is implementable incrementally, but it introduces a new semantic layer. It should not be implemented by changing customer terminology or treating the existing interest-mode vectors as a complete ontology.

QFF is a standalone system, currently visualized and explored through QFFViz. A matcher service and API layers are future components, not existing runtime dependencies. QFF currently stores preferences with definitions, kinds, persona-scoped signed affinities and embeddings in each identity's `*-properties.json`; its embedding refresh process uses Azure AI Foundry and caches vectors by model and text. The current match preview is a demonstration, not a production matching API.

The existing [`interest-modes.json`](interest-modes.json) is a useful hand-authored reference model for *how someone engages with an interest* (for example, participating, spectating or visiting). These modes and their submodes are not subject-matter concepts such as visual arts or outdoor recreation, and their weighted-average vectors do not encode broader/narrower relationships. Keep them intact and distinct. Curated concepts or mode-related signals may inform the new model where appropriate, but must be deliberately mapped rather than automatically reinterpreted as ontology nodes.

**Recommendation:** begin with stable preference identity, a separately versioned and hand-editable canonical concept catalogue, and separately stored derived mappings. The planned active consolidated dataset is LanceDB, keyed by stable identity and preference IDs; keep authoritative identity data in its JSON files, outside that database, and store embedding vectors only in LanceDB. Add heuristic scoring and concept-based matching in stages. Treat automatic concept discovery as proposal generation; require review and approval before publishing catalogue changes.

## Existing capabilities and gaps

| Area | Current QFF behavior | Implication |
| --- | --- | --- |
| Source preferences | Preferences are embedded in each identity's properties JSON; there is no stable `preference_id`. Definitions are currently the embedding input. | Keep identity source data in JSON and add stable references without rewriting its meaning. |
| Embeddings | Current preference and kind vectors are in properties JSON; QFFViz refreshes them through Azure and maintains a text-keyed cache. | In the planned LanceDB-backed dataset, store vectors only in LanceDB as regenerable derived data. Reuse compatible provider/cache safeguards, and do not compare incompatible vector spaces. |
| Interest modes | Hand-authored modes contain editable submodes, definitions, weights and vectors; mode vectors are weighted averages. | Preserve this separate engagement-mode model. Do not mistake mode labels, submodes or averages for a concept hierarchy. |
| Matching | QFFViz's match preview compares preference vectors and kind vectors, applies signed persona affinities, and displays pair-level evidence. Matching guidance requires per-party outputs to contain only that party's information. | Prototype concept matching alongside existing scoring first. Retain the source-preference path for explanation and preserve the per-party privacy boundary. |
| Inference lifecycle | There is no canonical concept catalogue, mapping store, calibration dataset, review queue, clustering workflow or model-publication process. | These are new capabilities; autonomous evolution cannot be achieved by changing the existing embedding refresh alone. |
| Operational scope | The available QFF data consists of six synthetic identities; the UI is a development/analysis tool. | These are simulated, non-production records and may be updated by agents as needed. Validate behavior on fixtures, but do not infer production-scale quality or calibrated probabilities from them. |

## Target data boundaries

Keep source, curated and derived data distinguishable, with storage roles explicit:

1. **Identity source:** each identity's authoritative JSON files, including its stable identity and preference IDs, original preferences, persona memberships and affinities. Identity source data does not live in the consolidated database and is never replaced by inferred labels.
2. **Curated model:** stable concept IDs, human-authored labels and descriptions, examples/exclusions, explicit parent relationships, status/version, and human-authored mapping guidance or overrides. The active consolidated model is planned to use LanceDB.
3. **Derived results:** semantic envelopes, candidate/accepted mappings, score and provenance metadata, and version references are stored in the LanceDB-backed consolidated dataset and linked to identity JSON by stable IDs. Embedding vectors are stored only in LanceDB, not duplicated in identity files. Vectors are regenerable derived state, not authoritative source.

Do not add inferred mappings to identity source files or `interest-modes.json`. Develop the LanceDB-backed dataset when the consolidated-data component is built; it is not an existing QFF dependency and is not an immediate implementation task. In the pre-hosted phase, commit the LanceDB files to the QFF repository. When QFF becomes hosted, move the database out of the repository and back it up independently. For production, store and secure each identity's source data independently from other identities, and secure and encrypt LanceDB for QFF-only use. These are future deployment requirements; the current simulation data is not production data.

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

### Phase 0 — Decisions and data contract

- Confirm whether the initial target is the QFFViz simulation or a production matcher, where derived data will live, and which identity data the inference service may access.
- Specify stable preference ID generation, backfill, collision handling and compatibility for old files. IDs must remain stable when wording, definition or persona memberships change.
- Define the concept, relationship, mapping, provenance, status and version schemas, including how hand-authored inputs and overrides are represented.
- Adopt the distinct `embedding_similarity`, heuristic `confidence_score`, and calibrated `probability` terms above. Until labelled review data supports a validated calibration model, emit only the first two; do not call either a probability.

### Phase 1 — Stable source references and curated concept catalogue

- Add/backfill stable preference IDs without changing keywords, definitions, kinds, affinities or persona associations.
- Add a separately versioned concept catalogue with stable concept IDs, labels, descriptive definitions, optional examples/exclusions, and explicit typed parent/related links.
- Seed it only with concepts deliberately reviewed for the subject-matter ontology. Keep `interest-modes.json` unchanged; reuse its hand-crafted content as guidance only where a deliberate mapping is valid.
- Extend the existing editing workflow or provide a focused catalogue editor for human-authored content. Preserve existing optimistic-concurrency and embedding invalidation behavior where applicable.

### Phase 2 — Derived semantic representations and mappings

- Generate a contextual semantic envelope using available source evidence (initially keyword and definition); keep persona names and affinity out of the primary embedding text.
- Reuse the existing embedding model configuration, cache and metadata checks. Store envelope text, model/version/dimensions and processing version with the derived result.
- Retrieve nearest approved concepts as candidates using `embedding_similarity`. Combine it with explicit evidence and concept relationships only after defining the heuristic `confidence_score`; keep persona affinity as a separate matching feature rather than allowing it to redefine preference meaning.
- Write mappings to LanceDB separately from source, including stable identity, preference and concept IDs; relationship type; distinct similarity and confidence fields; supporting evidence; score method/version; embedding metadata; and catalogue version.
- Classify results as inferred, review candidate or unmatched, with any operational auto-acceptance kept distinct from customer confirmation. An inferred result becomes an explicit source preference only after the customer selects it. Preserve the candidate and the reason it was accepted, rejected, overridden or confirmed.

### Phase 3 — Explainable concept-based matching

- Add an experimental matching path that compares identities through shared canonical concepts and typed hierarchy paths, while retaining direct preference matching as a comparison/fallback during evaluation.
- Propagate source preference IDs and mapping paths into internal evidence so a match can be explained at a specific or broader concept level.
- Keep persona affinity and existing kind/affinity semantics separate from ontology membership. Do not treat concept association as proof of compatibility.
- Preserve `matching.md`'s privacy contract: each party's result contains only that party's own persona and preference details, plus permitted generic computed evidence. Do not reveal counterpart keywords, affinities, inferred sensitive attributes or unique counterpart mappings. Review aggregate scores and explanations for indirect disclosure as well.
- Do not silently change production scoring thresholds or make match-preview scores appear to be calibrated probabilities.

### Phase 4 — Human review and controlled model evolution

- Collect low-confidence and unmatched candidates with the minimum evidence required for review; define retention, access and deletion rules before using real population data.
- Cluster recurring unmatched semantic representations as suggestions, not automatic concept creation. Single isolated preferences must not create canonical concepts.
- Let reviewers create, amend, merge, split, relate, approve or reject concepts and mappings. Record provenance and publish every approved change as a new catalogue version.
- Recompute affected derived mappings against the new version while retaining old-version results for audit and comparison. Never rewrite source records or silently migrate a human override.
- Let customers select inferred preferences they agree with; record each confirmed preference in that identity's source JSON as explicit, preserving the original preference and the confirmation link/provenance.
- Consider probability calibration only after collecting a sufficiently representative, human-reviewed mapping set and validating calibration separately from retrieval quality. Only then add a `probability` field with calibration metadata.

## Validation and release gates

- **Source preservation:** migration and refresh leave original keywords, definitions, kinds, affinities and persona memberships unchanged; stable IDs do not change on unrelated edits.
- **Hand-crafted control:** curated mappings and human overrides survive refresh/reprocessing; rejected mappings are not silently restored; curated text edits invalidate the correct derived vectors.
- **Schema and provenance:** invalid IDs, references, relationship types, probabilities/scores, vector dimensions or version metadata are rejected or marked unusable rather than treated as valid evidence.
- **Semantic behavior:** use reviewed fixture pairs to verify that paraphrases, specificity differences and valid broader concepts produce explainable candidate overlap, while unrelated meanings and excluded concepts do not become confident matches.
- **Uncertainty:** verify that `embedding_similarity` and heuristic `confidence_score` are distinct and never presented as calibrated probability; low-confidence and unmatched cases remain reviewable. If a `probability` field is introduced later, require held-out calibration evidence and its model/dataset/version metadata.
- **Customer confirmation:** selecting an inferred preference writes an explicit preference to the correct identity JSON with provenance, without mutating the original preference; unselected inference remains non-explicit.
- **Matching behavior:** compare the experimental path with existing direct matching on the six synthetic identities; retain examples and evidence paths and check score changes before considering any default change.
- **Privacy:** test both per-party output shapes and explanations for counterpart preference leakage, including information inferable from aggregated scores. Confirm that use of a preference for matching does not imply permission to disclose it.
- **Operational behavior:** verify deterministic/repeatable generation for a fixed source, catalogue and model version; detect stale LanceDB vectors; define retry, rollback and catalogue publication behavior. Keep the pre-hosted database files committed in QFF, and document the future move to externally backed-up hosted storage. Test without Azure credentials using cached vectors/fixtures where practical.
- **Deployment security:** before production, verify identity source stores are independently secured, LanceDB is encrypted and accessible only for QFF use, and migrations/backups preserve those boundaries. These are future hosted-solution gates, not assumptions about the current simulated fixtures.

## Main risks and open questions

1. **Terminology/model mismatch:** interest modes are manually authored but model engagement behavior, not a hierarchy of topics. An unreviewed conversion would mix distinct semantics and risk regressing current visualizations.
2. **False precision:** the proposal's example weights and thresholds are starting heuristics. Neither the six synthetic profiles nor embedding similarity alone can establish calibrated probabilities.
3. **Source identity and migration:** current preference entries lack stable IDs, so edits or reordering can make derived mappings ambiguous until identity and migration rules are established.
4. **Population learning and privacy:** clustering real preference data requires explicit decisions about data access, retention, sensitive information, deletion propagation and who may inspect evidence. These controls are not supplied by the ontology proposal.
5. **Architecture and scale:** QFF is standalone today, with QFFViz for visualization; matcher-service and API layers remain future work. The planned consolidated dataset is LanceDB, while identity sources remain JSON and vectors reside only in LanceDB. Do not adopt the proposal's generic Python/Parquet layout or imply that these future components already exist.
6. **Meaning of canonicality:** decide whether a canonical concept is a human-approved shared label, an inferred recurring cluster, or both in separate lifecycle states. Automated discovery should propose concepts; publication should remain controlled.

## Recommended first implementation milestone

Deliver **Phase 0 and Phase 1**, then a narrow Phase 2 prototype: stable IDs in identity JSON, a LanceDB-backed hand-editable/versioned catalogue and derived mapping dataset, vectors stored only in LanceDB, provenance-rich heuristic confidence scores, and clear human override semantics. Evaluate on the simulated fixtures without changing existing match behavior; agents may update these non-production identities as needed. Include customer confirmation so only selected inferences become explicit source preferences. Proceed to concept-based matching only after mapping and privacy validation gates pass; defer hosted deployment, production data isolation/encryption, unattended model publication and calibrated probabilities until their later-stage requirements are ready.
