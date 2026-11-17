# First-take plan: canonical preference ontology

## Purpose and recommendation

Review of [the evolutionary semantic ontology proposal](evolutionary-semantic-ontology-inference.md) against the current QFF model indicates that it is implementable incrementally, but it introduces a new semantic layer. It should not be implemented by changing customer terminology or treating the existing interest-mode vectors as a complete ontology.

QFF already stores preferences with definitions, kinds, persona-scoped signed affinities and embeddings in each identity's `*-properties.json`. Its embedding refresh process uses Azure AI Foundry, caches vectors by model and text, and keeps embedding-model metadata with the data. QFFViz supports editing preference and interest-mode text, and invalidates affected vectors when text changes. The current match preview is a demonstration, not a production matching API.

The existing [`interest-modes.json`](interest-modes.json) is a useful hand-authored reference model for *how someone engages with an interest* (for example, participating, spectating or visiting). These modes and their submodes are not subject-matter concepts such as visual arts or outdoor recreation, and their weighted-average vectors do not encode broader/narrower relationships. Keep them intact and distinct. Curated concepts or mode-related signals may inform the new model where appropriate, but must be deliberately mapped rather than automatically reinterpreted as ontology nodes.

**Recommendation:** begin with stable preference identity, a separately versioned and hand-editable canonical concept catalogue, and separately stored derived mappings. Add probabilistic scoring and concept-based matching in stages. Treat automatic concept discovery as proposal generation; require review and approval before publishing catalogue changes.

## Existing capabilities and gaps

| Area | Current QFF behavior | Implication |
| --- | --- | --- |
| Source preferences | Preferences are embedded in each identity's properties file; there is no stable `preference_id`. Definitions are currently the embedding input. | Add stable references without rewriting the source meaning. Preserve compatibility with existing fixtures and files. |
| Embeddings | Preference and kind vectors carry model name, version and dimensions. QFFViz refreshes embeddings through Azure and maintains a text-keyed cache. | Reuse the current provider, cache and stale-vector safeguards. Do not compare incompatible vector spaces. |
| Interest modes | Hand-authored modes contain editable submodes, definitions, weights and vectors; mode vectors are weighted averages. | Preserve this separate engagement-mode model. Do not mistake mode labels, submodes or averages for a concept hierarchy. |
| Matching | QFFViz's match preview compares preference vectors and kind vectors, applies signed persona affinities, and displays pair-level evidence. Matching guidance requires per-party outputs to contain only that party's information. | Prototype concept matching alongside existing scoring first. Retain the source-preference path for explanation and preserve the per-party privacy boundary. |
| Inference lifecycle | There is no canonical concept catalogue, mapping store, calibration dataset, review queue, clustering workflow or model-publication process. | These are new capabilities; autonomous evolution cannot be achieved by changing the existing embedding refresh alone. |
| Operational scope | The available QFF data consists of six synthetic identities and the UI is a development/analysis tool. | Validate behavior on fixtures, but do not infer production-scale quality or calibrated probabilities from them. |

## Target data boundaries

Keep three kinds of data distinguishable:

1. **Source:** existing customer-authored preference fields, persona memberships and affinities. These remain authoritative and are never replaced by inferred labels.
2. **Curated model:** stable concept IDs, human-authored labels and descriptions, examples/exclusions, explicit parent relationships, status/version, and any human-authored mapping guidance or overrides.
3. **Derived results:** semantic envelopes, embeddings, candidate and accepted mappings, confidence/calibration data, evidence, and processing/model versions. These are reproducible and versioned separately from both source preferences and curated concepts.

An initial catalogue could be a new QFF file such as `canonical-concepts.json`, with an explicit catalogue version. Derived mappings should be stored separately from identity source records (for example, in per-identity derived files keyed by stable preference ID, or in a generated JSONL dataset if the later runtime requires population-wide processing). Select the storage layout after deciding where matching will execute and how derived information is access-controlled. Do not add inferred mappings to `interest-modes.json`.

### Curated guidance and inferred results

Hand-crafted concepts, relationships and corrections are first-class model inputs. The design should support, at minimum:

- curated/approved concepts and explicitly human-authored parent or related-concept links;
- aliases, examples, exclusions and human-confirmed mappings where useful;
- an explicit human override or exclusion for an individual mapping, kept distinguishable from model evidence;
- proposed versus approved versus retired concept states; and
- version history so a later inference run cannot silently erase human changes.

Define precedence before implementation. At minimum, an explicit human override must take precedence over a generated candidate; a rejection must not be reintroduced as accepted by automatic inference. Source preference text remains unchanged regardless of the override. Changes to curated semantic text invalidate only its derived embedding, following the existing QFF text/vector invalidation rules.

## Proposed implementation phases

### Phase 0 — Decisions and data contract

- Confirm whether the initial target is the QFFViz simulation or a production matcher, where derived data will live, and which identity data the inference service may access.
- Specify stable preference ID generation, backfill, collision handling and compatibility for old files. IDs must remain stable when wording, definition or persona memberships change.
- Define the concept, relationship, mapping, provenance, status and version schemas, including how hand-authored inputs and overrides are represented.
- Decide what “probability” means. Embedding cosine is a retrieval signal, not a calibrated probability. Until labeled review data supports calibration, call the output a heuristic confidence/score and label it accordingly.

### Phase 1 — Stable source references and curated concept catalogue

- Add/backfill stable preference IDs without changing keywords, definitions, kinds, affinities or persona associations.
- Add a separately versioned concept catalogue with stable concept IDs, labels, descriptive definitions, optional examples/exclusions, and explicit typed parent/related links.
- Seed it only with concepts deliberately reviewed for the subject-matter ontology. Keep `interest-modes.json` unchanged; reuse its hand-crafted content as guidance only where a deliberate mapping is valid.
- Extend the existing editing workflow or provide a focused catalogue editor for human-authored content. Preserve existing optimistic-concurrency and embedding invalidation behavior where applicable.

### Phase 2 — Derived semantic representations and mappings

- Generate a contextual semantic envelope using available source evidence (initially keyword and definition); keep persona names and affinity out of the primary embedding text.
- Reuse the existing embedding model configuration, cache and metadata checks. Store envelope text, model/version/dimensions and processing version with the derived result.
- Retrieve nearest approved concepts as candidates. Combine similarity with explicit evidence and concept relationships only after defining the scoring semantics; keep persona affinity as a separate matching feature rather than allowing it to redefine preference meaning.
- Write mappings separately from source, including stable preference and concept IDs, relationship type, score/confidence, supporting evidence, inference method/version, embedding metadata and catalogue version.
- Classify results as accepted, inferred, review candidate or unmatched. An inferred result is never an explicit customer preference. Preserve both the candidate and the reason it was accepted, rejected or overridden.

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
- Consider probability calibration only after collecting a sufficiently representative, human-reviewed mapping set and validating calibration separately from retrieval quality.

## Validation and release gates

- **Source preservation:** migration and refresh leave original keywords, definitions, kinds, affinities and persona memberships unchanged; stable IDs do not change on unrelated edits.
- **Hand-crafted control:** curated mappings and human overrides survive refresh/reprocessing; rejected mappings are not silently restored; curated text edits invalidate the correct derived vectors.
- **Schema and provenance:** invalid IDs, references, relationship types, probabilities/scores, vector dimensions or version metadata are rejected or marked unusable rather than treated as valid evidence.
- **Semantic behavior:** use reviewed fixture pairs to verify that paraphrases, specificity differences and valid broader concepts produce explainable candidate overlap, while unrelated meanings and excluded concepts do not become confident matches.
- **Uncertainty:** verify that retrieval similarity is not presented as calibrated probability and that low-confidence or unmatched cases remain reviewable.
- **Matching behavior:** compare the experimental path with existing direct matching on the six synthetic identities; retain examples and evidence paths and check score changes before considering any default change.
- **Privacy:** test both per-party output shapes and explanations for counterpart preference leakage, including information inferable from aggregated scores. Confirm that use of a preference for matching does not imply permission to disclose it.
- **Operational behavior:** verify deterministic/repeatable generation for a fixed source, catalogue and model version; detect stale vectors; define retry, rollback and catalogue publication behavior. Test without Azure credentials using cached vectors/fixtures where practical.

## Main risks and open questions

1. **Terminology/model mismatch:** interest modes are manually authored but model engagement behavior, not a hierarchy of topics. An unreviewed conversion would mix distinct semantics and risk regressing current visualizations.
2. **False precision:** the proposal's example weights and thresholds are starting heuristics. Neither the six synthetic profiles nor embedding similarity alone can establish calibrated probabilities.
3. **Source identity and migration:** current preference entries lack stable IDs, so edits or reordering can make derived mappings ambiguous until identity and migration rules are established.
4. **Population learning and privacy:** clustering real preference data requires explicit decisions about data access, retention, sensitive information, deletion propagation and who may inspect evidence. These controls are not supplied by the ontology proposal.
5. **Architecture and scale:** QFF currently demonstrates matching in QFFViz and refreshes embeddings through Azure; it does not provide the production matching, population-ingestion or review infrastructure shown in the proposal's generic Python/Parquet layout. Choose a runtime and storage architecture based on the actual deployment target rather than adopting that example literally.
6. **Meaning of canonicality:** decide whether a canonical concept is a human-approved shared label, an inferred recurring cluster, or both in separate lifecycle states. Automated discovery should propose concepts; publication should remain controlled.

## Recommended first implementation milestone

Deliver **Phase 0 and Phase 1**, then a narrow Phase 2 prototype: stable IDs, a separate hand-editable/versioned catalogue with explicit curated status, derived candidate mappings with provenance, and clear human override semantics. Evaluate on synthetic fixtures without changing existing match behavior. Proceed to concept-based matching only after the mapping and privacy validation gates pass; defer unattended model publication and calibrated probabilities until review data and operational governance exist.
