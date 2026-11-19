# QFFLineage

QFFLineage is an on-demand, read-only viewer for QFF [OpenLineage](https://openlineage.io/) run metadata. From the repository root, run `pnpm --filter qff-lineage dev` and open [localhost:5188](http://127.0.0.1:5188), or launch **Start** from the QFFLineage VS Code workspace root. No database or lineage API is needed.

## Updating lineage

- Add or edit one pretty-printed OpenLineage `RunEvent` per JSON file under [`events/`](./events/). Use the same job namespace/name and `run.runId` for all events in a run. Reuse the same dataset namespace/name in producing and consuming events.
- Keep the files limited to lineage metadata. Event contents, including facets, are visible as raw JSON and included in a production build. Do not put credentials, identity records, or private preference data in these files.
- The [example events](./events/examples/) are synthetic. They show how to link fixture migration to reference indexing; they are not evidence of actual runs.

## Scope

The viewer builds a graph in memory. A job view shows inputs and outputs for the selected run; selecting a dataset shows producing and consuming jobs across recorded runs. Unreadable records are reported with their filenames. The viewer checks the fields it needs rather than performing full OpenLineage schema validation.

This is for a small, Git-reviewable collection, not continuous ingestion or a Marquez backend. Rebuild static output after editing events if using a built copy.
