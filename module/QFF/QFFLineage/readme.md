# QFFLineage

QFFLineage is an on-demand, read-only viewer for QFF [OpenLineage](https://openlineage.io/) dataset and run metadata. From the repository root, run `pnpm --filter qff-lineage dev` and open [localhost:5188](http://127.0.0.1:5188), or launch **Start** from the QFFLineage VS Code workspace root. No database or lineage API is needed.

## Updating lineage

Use the [lineage authoring guide](./lineage-authoring-guide.md) to turn QFF business interactions into jobs, datasets, and runs without presenting planned flows as observed executions.

- Add or edit one pretty-printed OpenLineage `DatasetEvent`, `JobEvent`, or `RunEvent` per JSON file under [`events/`](./events/). Use the same job namespace/name and `run.runId` for all events in a run. Reuse the same dataset namespace/name in standalone metadata and producing or consuming events.
- Keep the files limited to lineage metadata. Event contents, including facets, are visible as raw JSON and included in a production build. Do not put credentials, identity records, or private preference data in these files.
- The [initial baseline](./events/baseline/) maps `IdentityUser` profile (including approved personas), relations, and grouped preferences through [QFFIdentity action jobs](./events/baseline/qff-identity/) and the [Identity Repository API write objects](./events/baseline/identity-repository-api/) to three `identity-repository` files. Other namespaces still have [placeholders](./events/baseline/placeholders/). Legacy scripted test context is not modeled. `<id>` is a filename pattern, not a profile ID. The jobs are declared; no runs are recorded.

## Scope

The [profile workflows](./events/baseline/profile-workflows/) also show profile selection, reading the editor's starting state, and approving a generated preference that supersedes one or more previous preferences. Approval uses logical datasets, not an implemented API contract.

The graph shows all recorded jobs and datasets, including disconnected flows. Purple cards are datasets and green cards are jobs. Solid arrows come from run events; dashed arrows show declared dataset mappings or job dependencies without asserting a run. The graph starts at the left page gutter and uses the available width. Scroll the page to explore larger graphs. Select a card to open the floating details panel on the right, and drag the panel's left edge to resize it. Close the panel to uncover the graph. Filtering is not yet available.

Dataset cards show the field hierarchy from the latest valid OpenLineage `facets.schema` for that namespace and name. Arrays have a `[]` suffix, with item fields shown directly underneath rather than under a synthetic `_element` row. Select a dataset to see field descriptions where available. If no schema has been recorded, the card says so rather than guessing. Declared job cards list their actions below the job name, including [submission steps at the API boundary](./events/baseline/identity-repository-api/).

Hover over a card's right edge to reveal the 5 px resize strip, then drag it. You can also tab to the resize control and press Left or Right. Cards can shrink to 40 px, and field names wrap to fit.

The overview combines declared dependencies and dependencies from runs; it does not prove execution order, version handoffs, or that all inputs were used in one run. Select a job to inspect its declared actions, inputs, and outputs, or select a run to inspect its inputs, outputs, and raw event files. Unreadable records are reported with their filenames. The viewer checks the fields it needs rather than performing full OpenLineage schema validation.

This is for a small, Git-reviewable collection, not continuous ingestion or a Marquez backend. Rebuild static output after editing events if using a built copy.
