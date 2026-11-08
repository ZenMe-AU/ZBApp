# Interest modes

## Purpose

An interest keyword names a topic, but people engage with the same topic in different ways. Someone who watches Australian rules football and someone who plays it share a topic, yet would enjoy different activities together. An **interest mode** describes *how* a person engages with an interest.

Interest modes play a similar role to [kinds](persona_preference_embedding_model.md#kind-and-kind-embedding), but only for preferences of kind `interest`:

| | Kind | Interest mode |
| --- | --- | --- |
| Applies to | Every preference | Only `interest` preferences |
| Answers | *What sort of concept is this?* (interest, want, value, boundary) | *How does the person engage with it?* (participate, spectate, …) |
| Stored | `kind` field on each preference, plus `kind_vectors` | Not stored per preference; derived from the keyword and reference vectors |

The schema is unchanged: the mode is expressed in the keyword wording and inferred from embeddings for analysis and visualisation.

## Modes and reference phrases

Each mode has a display description and an array of weighted submodes in [interest-modes.json](interest-modes.json). The embedding job embeds each submode using its exact text only, without a mode prefix, with the same model and dimensions as the preferences. After refreshing, it automatically calculates parent mode vectors as weighted averages offline. A separate offline script remains available for weight-only changes. Descriptions, weights, submode vectors, embedding provenance, and mode vectors all reside in this single file; see [the submode guide](QFFViz/Docs/MODES_SUBMODES_GUIDE.md).

| Mode | Reference phrase |
| --- | --- |
| `participate` | taking part in an activity myself, such as playing a sport, riding, hiking or joining in |
| `spectate` | watching or attending as a spectator or audience member, such as at a match, concert or show |
| `visit` | visiting or exploring places, venues or exhibitions, such as galleries, markets, cafes or neighbourhoods |
| `create` | making or creating something myself, such as photographs, art, music, writing or software |
| `learn` | learning about, reading about or studying a subject |
| `discuss` | talking about, debating or sharing ideas on a topic with other people |
| `assist` | assisting, helping, teaching, organising or volunteering for other people or a community |

The list and texts are provisional. Text edits require clearing and refreshing the affected embeddings; weight changes and submode deletions need only offline recalculation. Stale averages are excluded from scoring until recalculated.

## Writing interest keywords

- **Lead with the activity** when the topic alone is ambiguous: `watching cricket`, `playing social tennis`, `attending live music`, `visiting galleries`, `taking photographs`.
- **Split multi-mode interests** into separate preferences, each with its own affinity, for example `watching tennis` (+0.7) and `playing social tennis` (+0.5).
- **Keep the topic recognisable** so topic-level similarity still works (`watching cricket` should stay close to `playing social cricket`).
- Keywords that already imply a mode (`casual cycling`, `moderate hiking`, `walking`) do not need rewording.
- Relation topics (`topics_shared`, `topics_private`) stay topic-level because they describe conversation subjects, not activities.

## Inferring a keyword's mode

Raw similarity to each reference phrase is dominated by topic: a sport keyword can sit closer to a phrase that mentions sport than to the phrase describing its actual mode. Analysis therefore compares several methods (see the *Preferences* pages in QFFViz):

- **Raw cosine** to each mode vector.
- **Relative score**: each mode's cosine minus the keyword's mean cosine across all modes, which removes a keyword's general pull towards every mode.
- **Contrast axis**: projection onto the difference between two mode vectors, such as `spectate − participate`. Topic content shared by both reference phrases cancels out, leaving mainly the difference in mode.

Inferred modes are discovery and analysis aids. They do not change matching until the matching rules are reviewed (see [matching.md](matching.md)).

### Initial findings (1536 dimensions)

- All 11 verb-worded keywords got the correct best mode under raw, relative and standardised scores. Those three methods always rank the modes the same way and differ only in how readable the scores are.
- Topic-only keywords (32) lead by a margin of only about 0.07, against about 0.11–0.14 for verb-worded ones, so their inferred mode is weak.
- The `spectate − participate` axis puts `watching tennis` at +0.15 and `playing social tennis` at −0.06, even though the two keywords have a topic cosine of 0.70. Every cross-mode labelled pair landed on the correct sides of its axis.

## Keywords refreshed in the 1536-dimension regeneration

The switch to 1536 dimensions regenerates every concept, kind and mode vector. The following texts changed since the previous embedding run and are embedded for the first time:

- Interest modes: all seven reference phrases above.
- Kinds: `want` (new) and `value` (new description).
- Reworded interests: `watching Australian rules football`, `watching cricket`, `watching tennis`, `attending the Australian Open`, `attending live music`, `watching live comedy`, `visiting galleries`, `visiting museums`, `taking photographs`.
- New split interests: `playing social tennis` (Liam O'Connor), `playing social cricket` (Marcus Reed).
