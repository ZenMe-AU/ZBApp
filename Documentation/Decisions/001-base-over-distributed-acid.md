# Prefer BASE Across System Boundaries

- Status: Accepted
- Date: 2026-10-27

## Context

ZenMe writes data across HTTP APIs, event queues, PostgreSQL, Azure Table Storage, and internal activity monitoring. These resources cannot share one reliable database transaction. Trying to make them commit atomically would tightly couple services and still leave failure windows.

The existing code already reflects both valid consistency models:

- Q3 Table Storage uses idempotent writes to repair a partial two-partition friend update and commits large Question shares in batches.
- Q3 follow-up processing can complete some independent writes before another write fails.
- Q5 uses PostgreSQL transactions when Question data, command status, and domain events share one database boundary.

## Decision

Prefer BASE data handling across service, queue, storage-partition, and SIEM boundaries:

- accept temporary inconsistency;
- make commands and compensations idempotent;
- propagate correlation and causation IDs;
- record observable command states;
- retry safe operations;
- reconcile incomplete work;
- use compensating transactions when a completed effect must be corrected.

Do not introduce distributed ACID transactions or two-phase commit.

This preference does not prohibit a local ACID transaction. Continue using one when all affected records share the same transactional database and must preserve a local invariant.

## Compensating Transactions

A compensating transaction is a new forward action that semantically corrects an earlier committed action. It is not a database rollback and does not erase history.

Each multi-step operation should define:

1. a stable command or event ID;
2. one correlation ID for the originating action;
3. durable progress states where recovery requires them;
4. idempotent retry behavior;
5. a compensating action or reconciliation rule for every material partial commit;
6. an audit event for the failure and its compensation.

Prefer completing the intended state when that is safe. For example, repair a missing reciprocal friend record or retry missing Question-share batches. Use a reversing action only when completion would violate the user's intent or a business rule.

Compensation must preserve the original event and link the corrective event through correlation and causation IDs.

## Activity and SIEM Data

The internal Activity store is an append-oriented, point-in-time event log, not the source of truth for current Quest state.

- A committed Quest action must not be rolled back because Activity ingestion failed.
- Activity ingestion is retried or reconciled using the event ID and correlation ID.
- Duplicate delivery is expected and deduplicated by stable identifiers.
- The Dashboard builds human-readable text from structured events at presentation time.
- Current Question and Answer state continues to come from the Quest APIs.

## Consequences

Benefits:

- services remain available during partial infrastructure failures;
- retries and audit history are explicit;
- storage adapters do not need identical transaction capabilities;
- Activity monitoring cannot block Quest writes.

Costs:

- users may briefly observe incomplete state;
- every multi-step operation needs an explicit recovery policy;
- operations require enough status and correlation data to diagnose and reconcile failures;
- compensations require focused failure-path tests.

## Existing Gaps

This decision records the target behavior; it does not claim that every current flow already implements it.

- Q3 follow-up processing can leave filters or shares committed when a sibling operation fails and currently has no durable compensation worker.
- Question sharing beyond one Azure Table transaction can commit earlier batches before a later batch fails.
- Historical Agent Lab runs remain as plain-text `.chat.md` files and are read only as a compatibility fallback; new runs use structured Activity events.

Address these gaps when the affected flow is changed. Do not add a generic saga framework in advance.
