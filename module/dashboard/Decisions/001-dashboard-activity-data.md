# Dashboard Activity Data

- Status: Accepted
- Date: 2026-10-27

## Decision

- The Dashboard builds human-readable text from structured Activity events at presentation time.
- Current Question and Answer state comes from the Quest backend, not the Activity store. The target access path is defined in [Dashboard Access to the Quest Backend](002-dashboard-quest-backend-access.md).

## Existing Gap

Historical Agent Lab runs remain as plain-text `.chat.md` files and are read only as a compatibility fallback; new runs use structured Activity events.

The system-wide consistency decision is documented in [Prefer BASE Across System Boundaries](../../../Documentation/Decisions/001-base-over-distributed-acid.md).
