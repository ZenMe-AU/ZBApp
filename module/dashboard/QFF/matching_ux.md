# QFF Matching UX Notes

## Purpose

Help people find approachable common ground and choose whether to start a conversation. A match is a discovery aid, not a verdict about total compatibility, a promise of friendship, or consent to disclose identity or contact details.

## Persona context

- Present results in the context of the person's own connection persona, such as outdoor activity friend or community connection.
- Keep different connection goals distinct. Do not combine unrelated persona results into one global compatibility judgment.
- A match in one persona can be useful even when there is no evidence for another persona.

## Topic ordering

Order suggested topics by type of positive alignment:

1. **Shared attraction:** concepts both people are positively drawn to. These are the default first suggestions.
2. **Shared aversion:** concepts both people are negatively drawn to. These are still common ground, but normally appear below shared-attraction topics.

Use context to decide whether a shared aversion makes a natural prompt. For example, when passengers are seated near an aircraft toilet, a low-pressure observation about unpleasant smells or ways to stay comfortable while travelling may be relevant. Do not turn every shared boundary into a topic simply because it aligned.

Suggested topics are invitations, not scripts. Let people skip, dismiss, or defer a suggestion without penalty. Prefer natural, situational phrasing over announcing that the system has inferred a shared dislike.

## Opposing preferences and privacy

The matcher discards opposite-sign preference-pair signals before aggregating scores. The UX receives no disagreement evidence: it must not show a mismatch warning, imply the other person disagrees, or lower a persona score because of that pair. Treat the discarded pair as though the other person had no opinion on that concept.

Positive alignment can come from several hidden counterpart preferences. In a per-party file, the UX can use only the owner's keyword, kind, affinity, and aggregate alignment. It must not infer or display the counterpart's exact preference, affinity, or persona. For an owner preference with negative affinity and positive alignment, the UX may classify the signal as shared aversion and rank it accordingly.

The two per-party match files contain each owner's own persona and preference data plus the opaque other-party ID. Do not expose that ID as a human identity or reveal counterpart profile information. Match scores are not probabilities and should not be presented as precise measures of relationship quality.

## Disclosure and interaction

- A topic match does not grant permission to reveal private profile information or contact details.
- Keep sensitive preferences out of suggested topics unless a future sensitivity and consent design explicitly allows their use and disclosure.
- A future preference-sensitivity control must govern derived outputs too; hiding the original preference while displaying a revealing alignment can still disclose it.
- Preserve existing interaction controls such as skip, defer, block, and withdraw. A high-ranked topic never obliges either person to engage.

## Simulation caveat

Current embeddings and scores are synthetic. Use the interface to exercise ranking and interaction flow, not to claim that the system has accurately inferred a person's preferences or likely friendship quality.