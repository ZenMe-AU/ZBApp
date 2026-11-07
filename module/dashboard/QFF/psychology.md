# Psychology behind QFF

## Purpose

This document explains the psychological ideas QFF draws on to describe people, personas and preferences, and to decide how matching and disclosure should behave. They are used as design frameworks for the profile model and UX. QFF is not a therapy tool, does not assess anyone psychologically, and does not claim that its scores measure wellbeing, personality or relationship quality.

Two frameworks shape the model:

- **Acceptance and Commitment Therapy (ACT)**: how to separate the things a person *wants* from the *values* they choose to live by.
- **The layered (onion) model of the self**: how personal information sits at different depths, and how relationships deepen as people reveal progressively deeper layers.

## Acceptance and Commitment Therapy (ACT)

### Background

ACT is a contextual behavioural therapy developed by Steven Hayes, Kirk Strosahl and Kelly Wilson from the late 1980s, and popularised for general audiences by authors such as Russ Harris. Its aim is *psychological flexibility*: being present, open to difficult experience, and doing what matters. ACT describes six core processes, often drawn as a hexagon (the "hexaflex"):

| Process | Short meaning |
| --- | --- |
| Acceptance | Making room for uncomfortable thoughts and feelings instead of fighting them |
| Cognitive defusion | Seeing thoughts as thoughts rather than facts or commands |
| Present-moment awareness | Paying flexible attention to what is happening now |
| Self-as-context | Noticing experience from a stable observing perspective |
| Values | Chosen qualities of action that give life direction |
| Committed action | Taking effective steps guided by values |

QFF uses only the **values** and **committed action** ideas, and only as a vocabulary for structuring preferences.

### Values versus wants and goals

ACT draws a sharp line between values and the things people want:

| | Value | Want / goal |
| --- | --- | --- |
| What it is | A chosen quality of one's own ongoing action, a way of being | An outcome, condition, possession, or something hoped for from others |
| Can it be completed? | No. It is lived, not achieved (being honest is never "done") | Yes. It can be obtained, lost or ticked off |
| Who controls it? | The person, in every moment | Partly the world and other people |
| Example | being honest, curious, considerate, reliable | safety on outings, an inclusive group, a reliable companion, a friend who shares my faith |

A key ACT principle is that **values describe how *I* want to act, never how others should act**. "I want people to be honest with me" is a want; "being honest" is a value. Wants are legitimate and important, but they depend on other people, so pursuing them can fail even when someone is fully living their values.

### How QFF applies ACT

The preference `kind` field follows this distinction (see [persona_preference_embedding_model.md](persona_preference_embedding_model.md)):

| Kind | ACT reading |
| --- | --- |
| `value` | An internal way of being the person chooses to act from. Never attributed to how other people are or act. |
| `want` | Something the person finds valuable to have or experience, including qualities they hope for in other people or in a relationship. |
| `interest` | Activities and subjects a person enjoys or avoids. These are the concrete arenas where values are lived and wants are pursued. |
| `boundary` | Behaviours or situations the person will not accept, usually expressed with negative affinity. In ACT terms these protect values and wants rather than being values themselves. |

Practical rules that follow:

- When a quality could be read both ways, record two preferences with distinct keywords. For example, `value: being reliable` (how I act) and `want: reliable companions` (what I hope for in others).
- A persona's `contributions` usually express values in action; its `expectations` usually express wants.
- **Wants are the most actionable signal for matching; values matter most where they meet someone else's want.** Knowing that another person also values being reliable says little about whether you would suit each other: you both simply intend to act that way. Knowing that they *want* a reliable companion, when you *value* being reliable, suggests you could offer what they are looking for. This **value ↔ want complementarity** (my value meets your want, and ideally the reverse) is a stronger discovery signal than shared values alone.
- **Shared wants** suggest people are looking for similar things (for example, both want safety on outings) and give natural common ground. **Shared values** are weaker evidence of fit, but are useful context once a connection exists.
- **Committed action**: a match is an invitation to act on values (for example, starting a respectful conversation), never an obligation. This is why the UX keeps skip, defer, block and withdraw available at every step (see [matching_ux.md](matching_ux.md)).

## The layered (onion) model of the self

### Background

Several psychological and social models picture a person as layers around a core, often called an **onion model**:

- **Social penetration theory** (Irwin Altman and Dalmas Taylor, 1973) describes relationships deepening as people disclose progressively more personal layers. Disclosure grows in **breadth** (more topics) and **depth** (more personal levels), is usually **reciprocal**, and can reverse (*depenetration*) when trust is damaged. Early exchanges stay at the surface; core layers are reached slowly, if at all.
- Related layered models of personality, such as McAdams' three levels (traits, characteristic adaptations, life story), and Hofstede's cultural onion (symbols, heroes and rituals around a core of values), share the same idea: outer layers are visible and situational, inner layers are more central, stable and authentic.

### Depth is not the same as privacy

Social penetration theory often treats inner layers as more intimate and therefore riskier to share. QFF separates two dimensions that are easy to conflate:

- **Depth (how personal):** how central and authentic something is to the person. Values and motivations are deep; activities and public facts are shallow.
- **Sensitivity (how private):** how much harm or discomfort disclosure could cause. This is the person's choice and can apply at any depth.

A deep layer is not automatically private. Someone may happily say they value curiosity or honesty, while a shallow fact such as their home suburb or daily routine may be highly sensitive. Deep layers are often simply *less useful to others* when shared in isolation: they tell you how the person intends to act, not what they are looking for. Privacy is therefore recorded explicitly (`topics_private`, boundaries, `initial_disclosure`, and the future sensitivity control in [matching.md](matching.md)) rather than inferred from depth.

### Layers as used in QFF

QFF maps profile information to layers by depth, from the outside in. Sensitivity is a separate, per-item choice that can apply to any layer:

| Layer | Typical content | Where it lives in QFF |
| --- | --- | --- |
| Outer (situational) | Name, broad location, occupation, activities and interests | `*-identity.json`, `interest` preferences |
| Middle (what I am looking for) | Wants, connection goals, preferred communication | `want` preferences, persona `connection_goal`, `expectations`, `communication_style` |
| Inner (who I choose to be) | Values, faith, ethics, motivations | `value` preferences, persona `motivation`, `contributions` |
| Core (life story) | Formative experiences, identity narrative, deeply held beliefs | Mostly outside the profile; shared only in conversation |

| Sensitivity marker | Applies to | Where it lives in QFF |
| --- | --- | --- |
| Private from a specific contact | Any topic | `topics_private` in relations |
| Not accepted at all | Behaviours and situations | `boundary` preferences (negative affinity) |
| Not shared early | Any detail | persona `initial_disclosure` |

The flight scenario's stages of [progressive disclosure](Readme.md#reciprocity-and-progressive-disclosure) order sharing by both depth and sensitivity: low-risk, situational information first, then preferences and values, then private information, and contact details last.

### How QFF applies the layered model

- **Start with outer and middle layers.** Suggested topics and first questions should come from interests and wants. They are low-risk and the most useful for discovering fit. An early question about deep beliefs can close off a connection (path dependence), not because it is private but because it is heavy for a first exchange.
- **Match on wants, enrich with values.** Wants and value ↔ want complementarity drive discovery; values add authentic context and help people decide whether to continue.
- **Persona-scoped breadth.** Each persona defines which topics are in scope. Breadth grows within a persona before it crosses into others.
- **Reciprocity.** Depth should increase only as both people disclose. A match result never reveals the other person's preferences at any layer (see [matching.md](matching.md)).
- **Sensitivity is explicit.** `topics_private`, `boundary` preferences and `initial_disclosure` mark what must not be raised or shared early, whatever its depth. Shared boundaries can still be common ground, but are offered cautiously and lower in suggestion lists.
- **Depenetration is allowed.** People can withdraw or reduce what they share at any point, and the system must respect it.

## How the two models fit together

ACT says *what kind* of thing a preference is (a value, a want, an interest or a boundary). The layered model says *how deep* it sits; sensitivity says *how private* it is. Together they guide:

- **Matching:** compare wants with wants, and look for complementarity between one person's values and the other's wants. Shared values alone are weak evidence of fit.
- **Disclosure:** begin with interests and wants, introduce values as authentic context once there is mutual interest, and respect explicitly private items at every layer.

## Limitations

- The sample identities, personas and affinities are synthetic. They illustrate the model; they are not psychological data.
- Kind labels are simplifications. Real people's wants and values blur, and a person should be able to correct how a preference is classified.
- Neither framework is used diagnostically, and match scores are discovery aids, not measures of compatibility or wellbeing.

## Further reading

- Hayes, S. C., Strosahl, K. D., & Wilson, K. G. *Acceptance and Commitment Therapy: The Process and Practice of Mindful Change* (2nd ed., 2012).
- Harris, R. *ACT Made Simple* (2nd ed., 2019) and *The Happiness Trap*.
- Altman, I., & Taylor, D. A. *Social Penetration: The Development of Interpersonal Relationships* (1973).
- McAdams, D. P. "What do we know when we know a person?" *Journal of Personality* (1995).
- Hofstede, G., Hofstede, G. J., & Minkov, M. *Cultures and Organizations: Software of the Mind* (3rd ed., 2010).
