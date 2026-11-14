# Quick start: interest modes

All mode data lives in [interest-modes.json](../../interest-modes.json).

1. Edit each mode's `submodes` array: change `text` or `definition`, adjust `weight`, or remove an entry.
2. If text or definition changed, clear its `vector` and the parent's `vector` to `null`. Run **Embeddings -> Update** or **Modes -> Edit -> Refresh embeddings** in QFFViz. Submode definitions are embedded; successful refreshes automatically calculate and persist mode averages.
3. For weight-only changes or deletions, use **Modes -> Edit -> Recalculate averages (offline)** or run `npm run calculate-mode-vectors` from QFFViz. No refresh is required.
4. Reload the UI.

Weight changes and deletions only need steps 3 and 4; averaging never accesses the network. Dry-run refreshes do not update embeddings or averages.

Each mode includes its exact name as a submode at weight `0.1`. Keep the mode's `definition` meaningful for display; it is not embedded directly. Offline recalculation verifies submode vectors against the local embedding cache; refresh first if the cache is unavailable.

See [the full guide](MODES_SUBMODES_GUIDE.md) for the schema and validation rules.
