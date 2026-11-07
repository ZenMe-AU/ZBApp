# Quick start: interest modes

All mode data lives in [interest-modes.json](interest-modes.json).

1. Edit each mode's `submodes` array: change `text`, adjust `weight`, or remove an entry.
2. If text changed, clear its `vector` and `embeddedText`, and the parent's `vector`, to `null`. Run **Embeddings -> Update** in QFFViz to refresh embeddings.
3. From QFFViz, run `npm run calculate-mode-vectors` to calculate mode averages locally.
4. Reload the UI.

Weight changes and deletions only need steps 3 and 4; averaging never accesses the network.

Each mode includes its exact name as a submode at weight `0.1`. Keep the mode's `description` meaningful for display; it is not embedded.

See [the full guide](MODES_SUBMODES_GUIDE.md) for the schema and validation rules.
