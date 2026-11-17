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
