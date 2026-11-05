# QFF Quest Friend Finder

## Scenario

You are on a two-hour flight with about 100 passengers. Among them are likely to be people you would enjoy meeting, people who share your interests or goals, and people who may also want to meet you.

The simulator explores how people discover these potentially valuable connections when communication is restricted, time is limited and trust must be earned.

## Mission

Identify compatible people, build enough mutual trust to exchange contact details, and create an opportunity to meet again after the flight.

A successful connection requires more than a high compatibility score. Both people must:

- recognise a reason to connect
- feel safe sharing progressively more information
- maintain mutual interest throughout the interaction
- voluntarily agree to continue the relationship after the flight

## Friendship goals

Before matching begins, each person must clarify what friendship means to them. This includes:

- the type of relationship they want
- why they want it
- what they can contribute
- what they expect from the other person
- which values or interests matter most
- their preferred communication style
- their boundaries and deal-breakers
- how much personal information they are initially willing to disclose

A person can maintain multiple personas, each representing a different connection goal, such as:

- career contact
- business partner
- sporting or hobby friend
- family friend
- community connection
- political ally
- potential customer
- potential supplier
- potential investor
- romantic connection

These personas may overlap, conflict or require different matching criteria.

## Environmental constraints

The flight environment imposes the following rules:

- There is no internet access. Devices can communicate only through local Wi-Fi network provided services
- Verbal and face-to-face communication is not practical
- The flight lasts two hours which is too short for direct chatting to be effective. During the fight there are disruptions (meal service, announcements, toilet breaks) that cause people to lose focus and delay responses
- There are too many possible connections for each person to investigate manually
- Individuals are infective at choosing which questions they answer leading to wasted effort
- Contact details are easily exchanged for business contacts but not for personal contacts or once mutual interests are identified and the other person is judged as safe

## Social constraints

### Limited information

Compatibility depends on the quality and completeness of each profile. Sparse, vague or misleading answers reduce the Matcher's ability to identify useful connections.

### Multiple personas

A person may be compatible with someone for one purpose but incompatible for another. For example, two people may align professionally while having little social compatibility.

### First impressions and path dependence

The questions a person asks, answers or avoids shape how others perceive them. Starting with an overly personal, divisive or transactional topic may close off other forms of connection later.

### Similarity, alignment and complementarity

Different relationship types use different compatibility patterns:

- friendships often grow from shared interests, values and mutual trust
- professional relationships depend on aligned goals, complementary skills and reliability
- commercial relationships depend on compatible needs, capabilities and incentives
- some relationships may benefit from complementary personalities rather than simple similarity

### Reciprocity and progressive disclosure

People are cautious because shared information may be misunderstood, exposed or used against them. Trust therefore develops in stages:

1. Public information, such as interests or professional topics
2. Low-risk preferences and personal experiences
3. Values, motivations and more sensitive opinions
4. Private information shared only after reciprocal trust develops
5. Contact details, exchanged only when both people want to continue the relationship

Disclosure should be mutual but not mechanically equal. Each person retains control over their boundaries.

## Available tools

### Quest app

The Quest app allows passengers to create profiles by answering questions and to send questions to other passengers.

Questions may be directed to:

- everyone on board
- people within selected matching categories
- people who match particular interests or goals
- a specific person after an initial match

Everyone may selectively answer, skip or defer a question. Both the questions someone asks and the answers they provide become signals that other people may use when deciding whether to engage.

The Quest app should support:

- multiple personas and connection goals
- visibility controls for individual answers
- staged disclosure levels
- anonymous or pseudonymous early interaction
- blocking, reporting and withdrawal of information previously shared
- mutual consent before revealing identity or contact details
- an audit trail showing what information has been shared with whom

### Matcher

Matcher compares a person’s profile with the profiles of other passengers. It can use only the information voluntarily provided.

For each persona, the matcher should evaluate:

- shared interests
- aligned goals
- compatible values
- complementary skills or needs
- communication preferences
- boundaries and deal-breakers
- desired relationship type
- willingness to disclose information at the same stage

The matcher present potential matches.

For example:

**Person A**

- Career: High school teacher
- Recreation: walking
- Religion: Christian

**Person B**

- Career: College professor
- Recreation: Hiking
- Religion: Spiritual

The matcher NEVER return any information from one person to another. It only ever returns a person's own or generic information back to a person.

Person A and B are matched on career topic of "teacher" and recreation interest of "hiking". When presenting the match to person A, the matcher returns person A's own interests that matched, not those of person B.

## Interaction loop

The simulation proceeds through the following stages:

1. **Define personas:** Write own persona descriptions as text files
2. **Build profile:** Create profile property lists based on the text descriptions. Then create potential questions and answers from those. Capture those questions and answers into Quest
3. **Discover:** Call Matcher API that returns the latest set of matches based on current information in Quest. Each match lists the personas and properties that enabled the match
4. **Send clarification question:** If interested, write or re-use a question and send it to a match or set of matches
5. **Exchange questions:** Both people choose questions that test compatibility without exceeding their current trust level
6. **Build trust:** Reciprocal answers unlock deeper question categories or additional profile details
7. **Reassess:** Either person can continue, change the connection goal, pause or end the interaction
8. **Save connection:** Connections save on Quest can be re-used without knowing personal contact details
9. **Disclose Details:** Before landing, each person may choose to enable contact details disclosure. This then sends it to the other person's saved contact
10. **Sync:** After landing each person may tell their Quest app to synchronise online the information it received. Continuing communication is possible if both parties synchronised online

## Suggested simulation mechanics

### Time and attention

Each interaction consumes a portion of the two-hour flight. People cannot deeply explore every match, so poor choices have an opportunity cost.

### Trust state

Each pair has a private trust state that changes according to reciprocity, consistency, respect for boundaries and mutually useful exchanges. Trust should not be exposed as a simplistic public score.

### Question cost

Questions can vary by:

- time required to answer
- sensitivity
- information value
- persona relevance
- risk of reducing trust

### Match confidence

Matcher can show confidence as low, medium or high, accompanied by the reasons for the match without sharing information from one person to another.

### Consent gates

Identity, private answers and contact details remain protected behind separate mutual-consent gates. Agreeing to chat does not imply agreement to disclose everything.

## Success conditions

A connection is successful when:

- both people independently choose to meet in person
- contact details are exchanged by mutual consent

Secondary measures may include:

- quality of the final connection rather than number of contacts
- accuracy of the initial match explanation
- balanced participation in the exchange
- respect for privacy and consent
- whether the connection remains mutually valuable after more information is shared

## Core design question

What design optimally help many compatible strangers discover one another and build authentic, reciprocal trust within two hours, without pressuring either person to surrender privacy, identity or control?
