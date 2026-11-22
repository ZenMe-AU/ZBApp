# QFFLineage

QFFLineage is an on-demand, read-only viewer for QFF [OpenLineage](https://openlineage.io/) dataset and run metadata. From the repository root, run `pnpm --filter qff-lineage dev` and open [localhost:5188](http://127.0.0.1:5188), or launch **Start** from the QFFLineage VS Code workspace root. No database or lineage API is needed.

## Updating lineage

Use the [lineage authoring guide](./lineage-authoring-guide.md) to turn QFF business interactions into jobs, datasets, and runs without presenting planned flows as observed executions.

- Add or edit one pretty-printed OpenLineage `DatasetEvent`, `JobEvent`, or `RunEvent` per JSON file under [`events/`](./events/). Use the same job namespace/name and `run.runId` for all events in a run. Reuse the same dataset namespace/name in standalone metadata and producing or consuming events.
- Keep the files limited to lineage metadata. Event contents, including facets, are visible as raw JSON and included in a production build. Do not put credentials, identity records, or private preference data in these files.
- Job and dataset definitions use standard OpenLineage facets: `jobType` (`integration: QFF`, `processingType: SERVICE`, `jobType: QUERY` or `COMMAND`), `documentation`, `schema`, and `columnLineage`. The only custom facet is [LineageDatasetFacet](./schemas/1-0-0/LineageDatasetFacet.json) under `qff_lineage`, kept for dataset mappings that have no job yet.
- The [initial baseline](./events/baseline/) maps `IdentityUser` profile (including approved personas), relations, and grouped preferences through [QFFIdentity action jobs](./events/baseline/qff-identity/) and the [Identity Repository API write objects](./events/baseline/identity-repository-api/) to three `identity-repository` files. Other namespaces still have [placeholders](./events/baseline/placeholders/). Legacy scripted test context is not modeled. `<id>` is a filename pattern, not a profile ID. The jobs are declared; no runs are recorded.

## Scope

The [profile workflows](./events/baseline/profile-workflows/) show one profile query from repository files through the API to the editor snapshot, and a separate planned approval command that supersedes one or more previous preferences. Query parameters appear on the card, not as arrows. The conditional approval write is modeled, not implemented.

The graph groups cards left to right by namespace: IdentityUser, QFFIdentity, Identity Repository API, then repository files. A boundary job sits next to the system it talks to, regardless of which way data moves. For example, QFFIdentity's right side holds both API submissions and response handling; arrowheads show the direction. Namespaces with only unconnected placeholders appear below the graph.

Purple cards are datasets and green cards are jobs. Solid arrows come from run events; dashed arrows show declared dataset mappings or job dependencies without asserting a run. Scroll the page to explore larger graphs. Select a card to open the floating details panel on the right, and drag the panel's left edge to resize it. Close the panel to uncover the graph. Filtering is not yet available.

Hover over an arrow to bring it to the front with a bright white 4 px stroke and a thin outline. Its dash pattern stays the same, and it stays in front at its normal colour and thickness when you move away. Selecting a card highlights its incoming and outgoing arrows and adds a shadow behind the card and those arrows until you select another card or close the details panel.

Dataset cards show the field hierarchy from the latest valid OpenLineage `facets.schema` for that namespace and name. Arrays have a `[]` suffix, with item fields shown directly underneath rather than under a synthetic `_element` row. Select a dataset to see field descriptions where available. If no schema has been recorded, the card says so rather than guessing. Job cards list input and output datasets, and declared jobs also show their documentation and Query or Command labels where applicable (query parameters appear only as a documentation line).

Hover over a card's right edge to reveal the 5 px resize strip, then drag it. You can also tab to the resize control and press Left or Right. Cards can shrink to 40 px, and field names wrap to fit.

The overview combines declared dependencies and dependencies from runs; it does not prove execution order, version handoffs, or that all inputs were used in one run. Select a job to inspect its documentation, column lineage, inputs, and outputs, or select a run to inspect its inputs, outputs, and raw event files. A dataset's details also list the column lineage that jobs declare for it, next to any custom declared mapping. Unreadable records are reported with their filenames. The viewer checks the fields it needs rather than performing full OpenLineage schema validation.

This is for a small, Git-reviewable collection, not continuous ingestion or a Marquez backend. Rebuild static output after editing events if using a built copy.
