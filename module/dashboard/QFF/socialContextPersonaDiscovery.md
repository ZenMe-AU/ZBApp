# Social-context and persona discovery

## Purpose

Discover candidate personas and social contexts by aggregating what a person shares, wishes to share, or prefers not to share with individual contacts. [relationPreferences.md](relationPreferences.md) describes one-to-one contact preferences; this proposal examines patterns across contacts.

- **Persona**: a recurring way the person presents themselves or pursues a connection goal.
- **Social context**: a setting or circle of contacts, such as work colleagues, church friends, or hiking companions.

A contact can encounter several personas and belong to several social contexts. The person reviews and names the patterns discovered from their sharing history and stated boundaries.

## Boundary-first input

People may find it easier or feel more comfortable naming concepts they prefer not to share than listing concepts they want to share. Offer a boundary-first prompt: "Which topics would you prefer to keep private from this contact?"

Repeated boundaries across contacts can help identify social contexts and the limits of a persona's audience. For example, someone may keep faith discussions private from several colleagues while sharing them with church friends, including a colleague who belongs to both circles.

Capture the person's explicit choice. An unanswered topic remains unknown; a preference for privacy describes disclosure suitability rather than dislike of the topic.

## Contact-topic graph

Represent sharing choices as a **bipartite graph** with two types of nodes: contacts and topics. A typed edge records an observed disclosure, a wish to share, or a preference to keep the topic private from that contact.

| Concept | Use |
| --- | --- |
| Node | A contact or topic. |
| Edge | A contact-topic disclosure or explicitly stated sharing choice, identified by type. |
| Topic degree | The number of distinct contacts with whom a topic was shared. |
| Cluster | Contacts with similar sharing choices, or topics with recurring audiences or privacy boundaries. |
| Overlap | Contacts or topics shared between clusters. |

Record each observation or choice with an opaque contact reference, topic, edge type, time, and source. Include the situation or disclosure depth when known. Summarize repeated disclosures by frequency and compare stated sharing choices separately.

## Example

| Contact | Topics intentionally shared |
| --- | --- |
| B | A, B, C, D |
| C | A, C, E, F |
| D | A, F, G, H |

- Topic A has degree 3 and is a candidate anchor topic.
- Topic C links contacts B and C.
- Topic F links contacts C and D.
- Contact C participates in both overlapping audiences.

Recurring topic bundles help distinguish a broadly shared topic from a persona-defining topic. Add explicit privacy choices to reveal audience boundaries: if the person prefers to keep topic F private from B but shares it with C and D, that provides another signal separating these audiences.

These bundles, audiences, and boundaries provide candidates for personas and social contexts.

## Discovery process

1. Collect explicit sharing choices, offering boundary-first input, alongside intentional disclosure observations.
2. Normalize topic concepts while retaining original wording and source observations.
3. Identify recurring topic bundles, similar audiences, privacy boundaries, and overlaps.
4. Present candidate patterns with supporting observations.
5. Let the person name, merge, split, confirm, or dismiss candidate personas and social contexts.

Keep source observations and choices, derived candidates, and person-confirmed structures separately identifiable. Store sharing history and boundaries privately, with controls to inspect, correct, and delete inputs and their derived results.
