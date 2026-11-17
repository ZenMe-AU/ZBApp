# Probabilistic preference normalisation and matching

## Intent

The system must identify meaningful **similarity, overlap and compatibility between the preferences of different identities**, even where those identities describe their interests using different words, levels of specificity or contextual language.

Customer-supplied preference terminology must be treated as the source of truth and must **not be rewritten or constrained to a fixed vocabulary**. Instead, the system must derive a probabilistic semantic model over the source data that allows disparate expressions to be related through shared, broader or associated concepts.

For example:

```text
Identity A:
"I like eating vanilla ice cream with chocolate sprinkles while walking on a hot day."

Identity B:
"Beach runs"Fpref
"Spending time with friends at cafes"
```

There may be little direct lexical overlap between these statements. However, they potentially intersect through concepts such as:

```text
physical activity
outdoor activity
warm-weather activity
food and dining
leisure
```

The objective is therefore not simply to find matching keywords. It is to establish relationships of the form:

```text
Source preference
      ↓
Explicit semantic meaning
      ↓
Normalised concept
      ↓
Broader concepts
      ↓
Probabilistic associations
      ↓
Shared concepts between identities
```

This semantic layer must evolve from the preferences actually present in the population rather than requiring customers to conform to a centrally prescribed taxonomy.

The master semantic model should therefore be considered **probabilistic and evolving**. New preferences may strengthen existing concepts, reveal relationships between concepts, or provide sufficient evidence for new concepts to emerge.

---

## Existing source structure

Each identity currently has a `xx-properties.json` containing records similar to:

```json
{
  "preferences": [
    {
      "keyword": "visiting galleries",
      "kind": "interest",
      "definition": "Viewing exhibitions of art and other creative work in a gallery.",
      "personas": [
        {
          "persona": "culture and photography friend",
          "affinity": 0.8
        }
      ]
    },
    {
      "keyword": "attending live music",
      "kind": "interest",
      "definition": "Going to a performance where musicians play in person.",
      "personas": [
        {
          "persona": "culture and photography friend",
          "affinity": 0.8
        }
      ]
    }
  ]
}
```

The original record should be preserved. Derived semantic information should be stored separately or added in a manner that clearly distinguishes source information from inferred information.

Where possible, assign each preference a stable identifier:

```json
{
  "preference_id": "pref-001",
  "keyword": "visiting galleries",
  "kind": "interest",
  "definition": "Viewing exhibitions of art and other creative work in a gallery."
}
```

---

## Core principles

The implementation must:

### 1. Preserve source preferences

Original customer-provided keywords, definitions, persona associations and other evidence must remain unchanged.

Derived concepts must not replace the original source data.

### 2. Separate observations from inference

Explicitly stated preferences, normalised interpretations and inferred broader interests must be distinguishable.

For example:

```text
visiting galleries
    │
    ├── explicitly observed: visiting galleries
    ├── normalised: gallery visiting
    ├── broader concept: visual arts
    ├── broader concept: arts and culture
    └── broader concept: leisure
```

Each inferred relationship should carry its own confidence or probability.

### 3. Use contextual meaning rather than keywords alone

Embeddings should represent sufficiently descriptive semantic statements rather than isolated terms such as:

```text
walking
music
beach
gallery
```

For example, instead of embedding:

```text
visiting galleries
```

prefer:

```text
Visiting galleries to view exhibitions of art and other creative work.
Cultural activity involving visual arts in a gallery environment.
```

Generic wording such as `customer preference for` should normally be excluded from the semantic text because all records represent preferences and therefore the wording provides little discriminatory information.

### 4. Maintain an evolving canonical concept model

Frequently occurring semantic patterns should progressively produce a shared vocabulary through:

- semantic extraction;
- embedding similarity;
- hierarchical relationships;
- clustering;
- probabilistic mapping;
- concept discovery; and
- controlled concept creation.

The canonical model is therefore derived from the population rather than imposed on it.

### 5. Allow hierarchical matching

Two identities need not share the same specific preference to have meaningful overlap.

For example:

```text
visiting galleries ─────────┐
                            ├── arts and culture ─── leisure
attending live music ───────┘
```

An identity interested in galleries and another interested in live music may therefore have weak or no overlap at the specific activity level but strong overlap at the `arts and culture` level.

### 6. Represent uncertainty explicitly

Relationships between a preference and a canonical concept must carry a confidence or probability rather than being represented as unconditional facts.

For example:

```json
{
  "preference_id": "pref-001",
  "concept": "arts and culture",
  "relationship": "broader_term",
  "probability": 0.91
}
```

Different relationship types should be retained, such as:

```text
explicit_preference
normalised_form
broader_term
ancestor
likely_context
associated_interest
weak_hypothesis
```

### 7. Preserve provenance

Every inferred relationship should be traceable to:

- the source preference;
- supporting evidence;
- extraction method;
- embedding model;
- processing/model version;
- canonical concept;
- canonical model version; and
- probability or confidence.

### 8. Continuously improve the model

Preferences that cannot be mapped confidently should become candidates for:

- clustering;
- discovering new concepts;
- identifying missing relationships;
- refining existing concept definitions; or
- human review.

Approved changes should result in a new canonical model version, after which affected preferences can be reassessed.

### 9. Optimise ultimately for identity-to-identity matching

Concept generation is an intermediate mechanism.

Its purpose is to make otherwise hidden preference overlap **measurable, explainable and searchable**.

---

# Processing pipeline

```text
Customer preferences.json
          │
          ▼
1. Validate and preserve source
          │
          ▼
2. Extract explicit semantic evidence
          │
          ▼
3. Build contextual semantic representation
          │
          ▼
4. Generate embeddings
          │
          ▼
5. Retrieve candidate canonical concepts
          │
          ▼
6. Calculate probabilistic mappings
          │
          ├── accepted mapping
          ├── inferred mapping
          ├── review candidate
          └── unmatched
          │
          ▼
7. Create derived preference/concept relationships
          │
          ▼
8. Compare identities through shared concepts
          │
          ▼
9. Cluster weak/unmatched preferences
          │
          ▼
10. Propose new/changed canonical concepts
          │
          ▼
11. Publish next master-model version
          │
          └──────────────► repeat
```

---

# Stage 1: validate and preserve source preferences

Load each identity's `preferences.json`, validate the structure and assign stable preference identifiers where required.

Do not overwrite the source record during later processing.

Example:

```json
{
  "preference_id": "pref-001",
  "keyword": "visiting galleries",
  "kind": "interest",
  "definition": "Viewing exhibitions of art and other creative work in a gallery.",
  "personas": [
    {
      "persona": "culture and photography friend",
      "affinity": 0.8
    }
  ]
}
```

---

# Stage 2: extract explicit semantic evidence

Extract structured information from each preference before performing broader inference.

For example:

```json
{
  "preference_id": "pref-001",
  "activity": "visiting",
  "object": "art exhibitions",
  "environment": "gallery",
  "explicit_domains": [
    "visual arts"
  ]
}
```

The extraction stage should favour information directly supported by the source text.

Avoid prematurely asserting broader concepts as facts.

---

# Stage 3: build a semantic envelope

Short terms often produce poor or unstable embeddings because they provide insufficient context.

Construct a standardised semantic representation from the available evidence.

For example:

```text
Visiting galleries to view exhibitions of art and other creative work.
Cultural activity involving visual arts in a gallery environment.
```

For another preference:

```text
Attending in-person performances where musicians play live music.
Cultural activity involving live musical performance.
```

The semantic envelope should describe **what the activity or interest means**, not merely state that the customer prefers it.

---

# Stage 4: generate embeddings

Generate an embedding for each semantic envelope.

Concept embeddings should be generated using similarly descriptive content.

For example, do not embed only:

```text
arts and culture
```

Instead embed something similar to:

```text
Arts and culture. Activities involving visual art, music,
performance, heritage and other forms of cultural expression.
Examples include visiting art galleries, museums, live music
performances and theatre.
```

This should provide a more stable semantic representation than short labels alone.

---

# Stage 5: maintain a master concept catalogue

Maintain canonical concepts independently from customer preferences.

Example:

```json
{
  "concept_id": "arts-culture",
  "label": "arts and culture",
  "definition": "Activities involving visual art, performance, heritage and other forms of cultural expression.",
  "examples": [
    "visiting galleries",
    "attending museums",
    "attending live music",
    "going to the theatre"
  ],
  "exclusions": [
    "commercial shopping",
    "general socialising without a cultural activity"
  ],
  "parent_ids": [
    "leisure"
  ],
  "model_status": "approved",
  "taxonomy_version": "1.0"
}
```

Concept definitions, examples and exclusions should contribute to their embedding representation.

---

# Stage 6: retrieve candidate concepts

For each preference embedding, retrieve the nearest canonical concepts.

For example:

```text
"visiting galleries"

Candidate concepts:

visual arts                 0.93
arts and culture            0.89
cultural activities         0.87
leisure                     0.72
photography                 0.61
```

Embedding similarity should be treated as **one signal**, not as a probability by itself.

---

# Stage 7: calculate probabilistic mappings

Combine several signals when deciding how strongly a preference maps to a canonical concept.

Possible signals include:

```text
embedding similarity
explicit textual evidence
ontology relationship
definition similarity
example similarity
cluster membership
context consistency
persona affinity
existing population patterns
```

An initial scoring model might use:

```text
semantic similarity        55%
explicit/example evidence  20%
ontology support           15%
contextual consistency     10%
```

These are starting values only.

Once reviewed examples exist, replace manually selected weights with a calibrated statistical model such as logistic regression or isotonic calibration.

The resulting score should answer something closer to:

> Given the available evidence, how strongly is this source preference supported as an instance, specialisation or associate of this canonical concept?

---

# Stage 8: write derived mappings

Derived mappings must not destroy or overwrite source preferences.

For example:

```json
{
  "preference_id": "pref-001",
  "mappings": [
    {
      "concept_id": "gallery-visiting",
      "relationship": "normalised_form",
      "probability": 0.98
    },
    {
      "concept_id": "visual-arts",
      "relationship": "broader_term",
      "probability": 0.94
    },
    {
      "concept_id": "arts-culture",
      "relationship": "broader_term",
      "probability": 0.91
    },
    {
      "concept_id": "leisure",
      "relationship": "ancestor",
      "probability": 0.83
    }
  ],
  "taxonomy_version": "1.0",
  "embedding_model": "embedding-model-name",
  "processing_version": "preference-pipeline-1.0"
}
```

An `attending live music` preference could independently produce:

```json
{
  "preference_id": "pref-002",
  "mappings": [
    {
      "concept_id": "live-music",
      "relationship": "normalised_form",
      "probability": 0.98
    },
    {
      "concept_id": "performing-arts",
      "relationship": "broader_term",
      "probability": 0.91
    },
    {
      "concept_id": "arts-culture",
      "relationship": "broader_term",
      "probability": 0.86
    },
    {
      "concept_id": "leisure",
      "relationship": "ancestor",
      "probability": 0.79
    }
  ]
}
```

The two identities can now overlap on `arts-culture` and `leisure` despite using different source terminology.

---

# Stage 9: match identities

Identity matching should operate over the derived concept graph rather than simply comparing original keywords.

For example:

```text
Identity A
└── visiting galleries
    ├── visual arts              0.94
    ├── arts and culture         0.91
    └── leisure                  0.83


Identity B
└── attending live music
    ├── performing arts          0.91
    ├── arts and culture         0.86
    └── leisure                  0.79
```

The intersection is therefore:

```text
arts and culture
leisure
```

A match can consequently be explained as:

> Both identities show strong evidence of an interest in arts and culture, although one expresses this through visual arts and gallery visiting while the other expresses it through live musical performance.

The system should retain the path that produced the match so that recommendations remain explainable.

---

# Stage 10: classify mapping confidence

Initial operational thresholds may be:

```text
0.90–1.00    accepted
0.75–0.89    inferred
0.55–0.74    review/candidate
<0.55        unmatched
```

These values are initial heuristics and must ultimately be calibrated against reviewed mappings.

An inferred relationship should never silently become an explicit customer preference.

---

# Stage 11: discover new concepts

Periodically process `unmatched` and low-confidence preferences as a population.

Cluster their semantic embeddings to identify recurring concepts not adequately represented by the existing canonical model.

For example:

```text
beach running
morning walks by the ocean
summer hiking
walking outside on warm days
outdoor exercise in summer
```

may form a coherent cluster.

Analysis of that cluster could propose:

```json
{
  "candidate_concept": "warm-weather outdoor physical activity",
  "candidate_parent": "outdoor recreation",
  "status": "proposed"
}
```

A new concept should not be created solely because one isolated phrase failed to match.

Concept creation should preferably be supported by recurring evidence across the preference population.

---

# Stage 12: evolve the canonical model

The canonical model should be versioned.

For example:

```text
taxonomy-v1.0
taxonomy-v1.1
taxonomy-v1.2
taxonomy-v2.0
```

A new version might:

- introduce concepts;
- merge duplicate concepts;
- split overly broad concepts;
- add parent/child relationships;
- improve definitions;
- add examples or exclusions; or
- modify mapping behaviour.

Previous mappings should retain the taxonomy version under which they were produced.

Where appropriate, affected preferences can then be reassessed against the new model.

This produces an iterative process resembling:

```text
Observed preferences
        ↓
Current semantic model
        ↓
Probabilistic mappings
        ↓
Identify unexplained patterns
        ↓
Improve semantic model
        ↓
Re-evaluate mappings
        ↓
Observe new preferences
        ↓
...
```

---

# Persona treatment

Persona information may provide useful supporting context but should not dominate the primary semantic embedding.

For example:

```json
{
  "persona": "culture and photography friend",
  "affinity": 0.8
}
```

Including the persona text directly in every preference embedding could artificially pull unrelated preferences together.

Prefer treating persona information as a separate feature:

```text
semantic similarity      0.84
shared persona affinity  0.80
ontology support         0.91
context consistency      0.88

              ↓

calibrated mapping probability
```

This allows persona relationships to influence matching without redefining the semantic meaning of the underlying preference.

---

# Suggested implementation structure

```text
customers/
  customer-001/
    preferences.json

  customer-002/
    preferences.json

master-model/
  concepts-v1.0.json
  concepts-v1.1.json

derived/
  semantic-envelopes.jsonl
  preference-embeddings.parquet
  concept-embeddings.parquet
  candidate-mappings.jsonl
  accepted-mappings.jsonl
  unmatched-preferences.jsonl

models/
  mapping-calibrator.pkl

pipeline/
  validate.py
  extract.py
  expand.py
  embed.py
  retrieve.py
  score.py
  match.py
  cluster.py
  publish.py
```

---

# Conceptual data model

```text
Identity
   │
   └── Preference
          │
          ├── original keyword
          ├── original definition
          ├── persona affinity
          │
          └── Derived mapping
                  │
                  ├── Concept
                  ├── Relationship type
                  ├── Probability
                  ├── Evidence
                  ├── Embedding model
                  ├── Processing version
                  └── Taxonomy version


Concept
   │
   ├── label
   ├── definition
   ├── examples
   ├── exclusions
   │
   └── Relationships
          │
          ├── broader than
          ├── narrower than
          ├── associated with
          └── parent/child
```

---

# Architectural objective

The architecture must build an **evolving, probabilistic canonical semantic model from disparate identity preferences so that meaningful similarity can be discovered even when identities use different terminology**.

The desired model is therefore not:

```text
Customer terminology
        ↓
force into fixed taxonomy
```

It is:

```text
Customer terminology
        │
        ├──────────── preserve original meaning
        │
        ▼
Probabilistic semantic interpretation
        │
        ▼
Shared canonical concept graph
        │
        ├──────────── learn from population
        │
        ▼
Identity-to-identity overlap
        │
        ▼
Explainable matching
```

The canonical model should become richer as the population grows while preserving source terminology, uncertainty and provenance.

The resulting system should be able to explain not only **that two identities match**, but **why they match, at what semantic level they match, what evidence supports the match, and how confident the system is in that interpretation**.
