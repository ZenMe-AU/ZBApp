# Offline mode averaging

[calculate-mode-vectors.ts](../../calculate-mode-vectors.ts) reads and updates [interest-modes.json](../../interest-modes.json).

From QFFViz, run `npm run calculate-mode-vectors`. Alternatively, from QFF, run `node calculate-mode-vectors.ts` with Node 24.

The script computes the weighted average of every mode's positive-weight submode vectors, updates parent vectors, and preserves all other fields. No Azure credentials or network access are required.

Missing or stale active embeddings, invalid weights, and mismatched dimensions cause a nonzero exit instead of a partial average. Changed text invalidates its vector and parent vector; refresh embeddings from **Embeddings -> Update** in QFFViz before retrying.

See [the submode guide](MODES_SUBMODES_GUIDE.md) for editing and embedding refresh instructions.
