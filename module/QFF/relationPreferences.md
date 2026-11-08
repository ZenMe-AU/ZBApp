# Contact-scoped preferences

## Status and purpose

This document proposes a separate `relation_preferences` set for representing how suitable a topic feels in a one-to-one relationship with a particular contact. It is exploratory and is not part of the current QFF identity or persona schema. The existing preference model and matcher remain unchanged unless this proposal is adopted separately.

The goal is to support soft, context-dependent topic ranking for an individual contact. For example, a person may be comfortable discussing religion with one contact who is a church friend, but not with another contact who is a work colleague. The same contact may also be a colleague, church friend, or hiking companion in different situations. A low conversation fit does not necessarily mean the person dislikes the topic, disagrees with the contact, or wants the topic permanently blocked.

These are pairwise preferences, not aggregate descriptions of a social group or persona. Aggregating observed disclosures across contacts to discover personas or social contexts is a separate problem described in [socialContextPersonaDiscovery.md](socialContextPersonaDiscovery.md).

## Relationship to the current preference schema

Each relation preference reuses the current concept representation for its topic: a human-readable `keyword`, `kind`, signed `affinity` when the person's attraction or aversion is known, and `embedding`. It also uses the identity's existing `embedding_model` metadata. The relation context is an additional semantic concept, such as `work colleague` or `church friend`, with an embedding generated in a compatible vector space.

Conversation fit is a separate signal from affinity:

- `affinity` describes the person's stance toward the topic.
- `conversation_fit` describes how natural or comfortable the topic is in the relationship context.
- A low conversation fit must not be interpreted as negative affinity, disagreement, or a match penalty.

For example, someone could have positive affinity toward religion while assigning it low conversation fit with work colleagues. The topic may matter to them, while still not being one they usually want to discuss in that context.

## Proposed schema

```json
{
  "relation_preferences": [
    {
      "contact_ref": "opaque-contact-b",
      "relationship": {
        "keyword": "work colleague",
        "embedding": null
      },
      "topic_preference": {
        "keyword": "religion",
        "kind": "topic",
        "affinity": 0.7,
        "embedding": null
      },
      "conversation_fit": 0.2,
      "confidence": 0.8,
      "source": "person_stated"
    }
  ]
}
```

Field meanings:

- `contact_ref`: an opaque reference to the individual contact for this one-to-one preference. Do not use a name or other directly identifying contact detail in this preference record.
- `relationship`: the owner's description of their relationship with this contact, such as `work colleague` or `church friend`. One contact may have multiple relationship descriptions, and these labels may be unknown or change over time. Its `keyword` and optional embedding use the same semantic representation principles as preference concepts.
- `topic_preference`: a normal preference concept from the current schema. `affinity` may be omitted when unknown in this proposed set; when present, it retains its current meaning and does not determine conversation fit.
- `conversation_fit`: a soft value from `0.0` to `1.0`. Lower values mean less natural or comfortable to raise the topic in this context; higher values mean more natural. It is not a probability or a hard permission.
- `confidence`: confidence in the relation preference, especially when it was inferred. Missing or uncertain information is unknown, not a zero fit.
- `source`: whether the preference was stated by the person or inferred. Inferred values should remain tentative and be offered for correction rather than silently treated as fact.

The sample values are illustrative, not calibrated. A production design may choose a different scale or representation after testing with users.

## Fuzzy relationship and topic matching

Relationship labels and topic keywords may differ while referring to similar contexts. A matcher may use compatible embeddings to estimate relationship-context similarity and topic similarity for this contact. For instance, `work colleague` may be related to `professional peer`, while `religion` may be related to `faith` or `church attendance`.

These similarities can help rank topic suggestions using the owner's relation preferences. They do not establish that two relationships or topics are identical. Keep the underlying labels available for explanation, and avoid surfacing a topic when the inferred context or fit is too uncertain. Vectors from incompatible models, versions, dimensions, or generation methods must not be compared.

`conversation_fit` is a ranking signal, not a match-alignment signal. Relation preferences must not alter persona affinity scores, create evidence of agreement or disagreement between two people, or reveal the owner's private relationship context to the other person.

## Scope, privacy, and control

- Use an opaque contact reference and prefer broad relationship labels, such as `work colleague` or `church friend`, over storing third-party names or detailed descriptions.
- Relation preferences belong to the profile owner's context. Do not assume the other person has the same topic norms.
- Use these preferences to rank or omit suggested topics for the owner's interaction with this contact. Do not expose the context, preference, or inference to the other person.
- A low fit is a soft signal, not a prohibition. If a person wants a topic never to be suggested in a context, represent that as a separate explicit control rather than overloading `conversation_fit`.
- The person can inspect, correct, or remove inferred relation preferences. Do not infer sensitive beliefs about either party from topic suitability alone.

## Stored and derived data

The proposed stored data is the contact reference, relationship label, topic preference, conversation fit, confidence, source, and compatible embedding metadata/vectors. Similarity between relationship labels and topics, contextual topic rankings, and suggestion results are derived or cacheable data. Do not aggregate these one-to-one records into personas or social groups in this model.

This proposal extends the current preference concept representation without changing the existing persona preference schema. It adds a contact-specific relationship and conversational suitability as orthogonal data, not as new affinity semantics.