# Analysis: "Discuss" Mode Vector Issue

Historical analysis: mode definitions and generated vectors now reside together in [interest-modes.json](interest-modes.json). See [the current guide](MODES_SUBMODES_GUIDE.md); the filenames below refer to the earlier design.

## Current Reference Phrase
From the former `embedding-interest-modes.json`:

```json
"discuss": "talking about, debating or sharing ideas on a topic with other people"
```

## The Problem
The reference phrase is **too general and people-focused**, missing the key semantic elements that would match with domain-specific keywords like "architecture" or "artificial intelligence".

### Why the scores are low:
1. **Keywords embedded in isolation** - "architecture" and "artificial intelligence" are embedded as standalone nouns
2. **Reference phrase emphasizes social interaction** - "with other people" frames discuss as a social activity
3. **Missing domain expertise context** - The phrase doesn't mention technical topics, professional discussion, or knowledge-sharing
4. **Mismatch in semantic space** - The embedding model learns that "discussing architecture" is about: people, communication, ideas
   - But the keyword "architecture" alone is about: structures, design, systems, technical concepts

### Similar Issue with "artificial intelligence"
Same root cause - low "discuss" score because the mode vector doesn't capture domain-specific discussion adequately.

---

## Potential Solutions

### Option 1: Enhance the Reference Phrase (Quickest)
**Change the current phrase to:**
```json
"discuss": "talking about, debating or sharing news about a topic; discussing professional or technical subjects"
```

**Pros:**
- Single embedding update
- Maintains simplicity
- Better captures technical discussion context

**Cons:**
- Still may not perfectly capture all discussion contexts
- Binary choice: either professional or casual

---

### Option 2: Multiple Exemplar Phrases with Vector Averaging (Recommended)
**Concept:** Embed multiple related reference phrases and average their vectors

**Example phrases for "discuss":**
```
1. "talking about, debating or sharing ideas on a topic with other people"
2. "discussing and sharing the latest news or findings on a subject"
3. "having in-depth conversations about technical or professional topics"
4. "debating different perspectives and interpretations of a concept"
```

**Implementation:**
```typescript
// In embedding code, for modes with multiple phrases:
const phrases = [
  describe('discuss', "talking about, debating or sharing ideas on a topic with other people"),
  describe('discuss', "discussing and sharing the latest news or findings on a subject"),
  describe('discuss', "having in-depth conversations about technical or professional topics"),
  describe('discuss', "debating different perspectives and interpretations of a concept"),
];

// Embed all phrases, then average the vectors
const vectors = await embedBatch(phrases);
const averagedVector = averageVectors(vectors);
```

**Pros:**
- Captures multiple facets of "discussing"
- More robust to edge cases
- Better coverage: social, professional, technical, news-sharing
- Mathematically principled (vector averaging)

**Cons:**
- 4x embedding cost for that mode
- Requires code changes to support multi-phrase modes
- Need to define exemplars carefully

---

### Option 3: Context-Paired Keywords (Most Sophisticated)
**Concept:** For nouns like "architecture", embed them with activity context

Instead of embedding just "architecture", also create variants:
```
- "architecture" (current, for general matching)
- "discussing architecture" (new, for discussion contexts)
- "designing architecture" (new, for create contexts)
- "learning about architecture" (new, for learn contexts)
```

**Pros:**
- Perfectly captures intended semantics
- Keywords automatically have appropriate mode affinity
- Most semantically accurate

**Cons:**
- Major data restructuring required
- Explosion of embeddings per keyword
- Storage and performance implications
- Manual curation needed to decide which contexts apply to each keyword

---

## Recommendation: Hybrid Approach

**Phase 1:** Implement **Option 2** (Vector Averaging) for modes that seem too narrow:
- Start with "discuss" (has the issue)
- Potentially also "help" and "learn" (tend to be general)

**Phase 2:** Create a new field in the former `embedding-interest-modes.json`:
```json
{
  "discuss": {
    "description": "talking about, debating or sharing ideas on a topic with other people",
    "exemplars": [
      "talking about, debating or sharing ideas on a topic with other people",
      "discussing and sharing the latest news or findings on a subject",
      "having in-depth conversations about technical or professional topics",
      "debating different perspectives and interpretations of a concept"
    ]
  }
}
```

**Phase 3:** Update embedding code in [embeddings.ts](QFFViz/src/server/embeddings.ts) to:
- Detect when a mode has multiple exemplars
- Embed each exemplar
- Average the resulting vectors
- Store the averaged vector for the mode

---

## Immediate Testing Suggestion

Before committing to changes, let's test with an improved phrase:

Replace:
```json
"discuss": "talking about, debating or sharing ideas on a topic with other people"
```

With:
```json
"discuss": "discussing or debating topics including sharing latest news, technical insights and diverse perspectives"
```

Then re-run embeddings to see if "architecture" and "artificial intelligence" score higher on discuss.
