# QFF Matching

## Match run

A match run compares two identities, A and B, and produces exactly two match files: one owned by A and one owned by B. Each file contains its owner's identity ID, an opaque `their_id` reference, and only its owner's persona names and preference properties. It must not contain the other identity's persona names, keywords, affinities, or other profile data. Similarity scores and other generic computed results may appear in both files.

In A's file, `my_id` is A and `their_id` references B; in B's file, `my_id` is B and `their_id` references A. The two files share the same opaque `match_id` and `matched_at`, which identify the common pairwise run. A later comparison creates a new pairwise `match_id` and timestamp. Production identity IDs are opaque; human-readable IDs in examples and test fixtures are not representative of production IDs.

## Per-party output schema

```json
{
  "my_id": "liam-oconnor-melbourne",
  "their_id": "daniel-mercer-brisbane",
  "match_id": "qff-match-20261105T114032Z",
  "matched_at": "2026-11-05T11:40:32Z",
  "matches": [
    {
      "persona": "outdoor activity friend",
      "score": 0.55,
      "matched_properties": [
        {
          "keyword": "walking",
          "kind": "interest",
          "affinity": 0.8,
          "alignment": 0.64
        },
        {
          "keyword": "moderate hiking",
          "kind": "interest",
          "affinity": 0.8,
          "alignment": 0.56
        },
        {
          "keyword": "safety",
          "kind": "value",
          "affinity": 0.9,
          "alignment": 0.72
        }
      ]
    }
  ]
}
```

The example's alignments and score are illustrative values for the output shape, not recalculated results, calibrated probabilities, or evidence of real-world compatibility. Each displayed alignment may summarize multiple hidden counterpart preferences; the abbreviated example is not enough to reconstruct the score.

The paired file for Daniel uses the same `match_id` and `matched_at`, sets `my_id` to `daniel-mercer-brisbane`, and sets `their_id` to `liam-oconnor-melbourne`. It includes only Daniel's matching persona names and properties; it does not include Liam's persona names, keywords, affinities, or other profile information.

## Field meanings

- `my_id`: the owner of this file and the identity whose persona results it contains. The paired file has the other person's ID as `my_id`.
- `their_id`: an opaque reference to the other identity in the pair. It is an identifier only, not a copy of that identity's persona or profile data. Production IDs are opaque even though test IDs may be readable.
- `match_id`: an opaque ID shared by the two per-party files generated for the same pairwise run. It identifies the run, not either person, and should not encode either identity ID.
- `matched_at`: UTC time shared by the two files for this pairwise run.
- `matches`: a flat list of persona-level results for this file's `my_id`. Each entry describes one of that person's personas that matched the other identity. If several of their personas match, emit one entry per persona.
- `persona`: a persona belonging to this file's `my_id`. Never include the other person's persona name.
- `score`: a non-negative aggregate of the positive shared-ground signals retained for this persona. It measures discovered common ground, not total compatibility or probability. A missing persona result means no positive shared ground passed the matching rules; it does not mean the people are incompatible.
- `matched_properties`: explainable evidence from this file's `my_id` profile only. The keyword, kind, and affinity are the owner's own values. `alignment` is the positive per-preference signal serialized; it may aggregate comparisons against multiple hidden counterpart preferences. Concept and kind similarities and the counterpart-to-counterpart mapping are used internally and are not emitted. Never include the other person's keywords or affinities.

## Demonstration scoring

For compatible concept and kind vectors, calculate an internal raw pair signal:

```text
raw_pair_alignment_ij = concept_similarity_ij * kind_similarity_ij * affinity_i * affinity_j
```

The component similarities and pair mapping are intermediate values and are not included in either person's file. Retain only raw pair signals greater than zero. Discard zero and negative signals completely: do not serialize them, include them in an aggregate, or count them in an averaging denominator. This makes an opposing preference pair equivalent to no opinion for discovery and prevents disagreement from lowering the result or being disclosed.

Same-sign affinities produce positive raw alignment: positive-positive means shared attraction, and negative-negative means shared aversion. Opposite-sign affinities produce a negative raw signal that is discarded. For example, the sample `high-intensity guided hiking` and `party-political activity` pairs each have opposite affinities and identical concept vectors, so each would produce a raw signal of `-0.64`; neither appears in either match file or affects a score.

Interpret a retained positive alignment together with the owner's affinity:

- Positive affinity and positive alignment indicate shared attraction to a concept. These are the default highest-priority topic suggestions.
- Negative affinity and positive alignment indicate likely shared aversion in that semantic area. This is still positive common ground and may be suggested below shared-attraction topics when it is relevant to the situation. For example, a shared aversion to bad smells may be a natural lower-priority topic when passengers are seated near an aircraft toilet.
- A `boundary` kind is not automatically suppressed as a topic. Shared boundaries can be useful common ground or context for a suggestion, but whether to raise one depends on the situation and any sensitivity or disclosure controls.

Because an alignment can aggregate multiple hidden counterpart preferences, it indicates a semantic-area signal, not an exact one-to-one match or proof that every counterpart preference has the same polarity. The UX may use the owner's affinity sign and kind to distinguish shared aversion from shared attraction without revealing the other person's properties.

One persona preference may relate to several preferences on the other profile. For the simulation, consider pairs that pass the `0.55` minimum for both concept and kind similarity, calculate their raw pair signals, and discard any signal less than or equal to zero. Calculate a local preference's exported `alignment` as the arithmetic mean of its retained positive pair signals only. If it has no retained signals, omit it from `matched_properties` and from score denominators. Calculate each direction's persona score as the mean of that side's retained per-preference alignments, then average the two directional scores. If neither direction has positive evidence, omit the persona match. This allows multiple counterpart affinities to contribute without exposing which counterpart preferences were involved. Thresholds and aggregation functions remain simulation settings, not identity-schema requirements.

Represent a compound idea as separate preference entries when its parts have distinct meanings or affinities. If a compound preference must remain one entry, aggregate its retained positive pair signals internally into its single exported alignment; do not imply that this alignment corresponds to one counterpart preference.

Only compare vectors with compatible model metadata and dimensions. If kind vectors are incompatible, defer or omit that evidence rather than treating the vectors as comparable. This follows the portable, BASE-consistent identity-file model described in [persona_preference_embedding_model.md](persona_preference_embedding_model.md).

## Privacy and consent

Each per-party file contains the owner's own profile data plus the opaque `their_id` reference needed to identify the comparison target. The matcher may compare both profiles internally, but it must not copy the other party's persona names, keywords, affinities, answers, or other profile data into this file. An aggregate alignment does not identify a unique counterpart preference or affinity, but it can still reveal a weighted signal; coarsen or omit it if the recipient should not learn that signal. Keep the mapping from opaque production IDs to real identities protected. A match does not imply identity disclosure, trust, contact sharing, or consent to continue.

## Future enhancement: preference sensitivity

Consider adding a sensitivity rating to individual preferences in a future version. Sensitivity is separate from `affinity`: affinity describes attraction or repulsion, while sensitivity describes how private or consequential the owner considers that information. For example, a person may have an attraction preference related to an ethnic group but not want that preference to be known.

The current schema does not define sensitivity or its UX. A future design must separately consider whether a sensitive preference may be stored, used internally for matching, or revealed in a match result or suggested topic. Permission to use information for matching must not imply permission to disclose it. Derived values such as `alignment` and persona `score` can also reveal information about a sensitive preference and need to follow the same controls. No sensitivity field or behavior is introduced by this note.