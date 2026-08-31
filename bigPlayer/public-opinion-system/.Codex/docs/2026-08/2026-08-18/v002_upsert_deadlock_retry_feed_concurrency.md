# Daily Q1 feed concurrency and transaction retry

Date: 2026-08-18

## Background

A serialized Q1 feed crawl completed in about 2,887 seconds. A collection-only measurement took about 1,759 seconds, so collection remains the main wall-clock cost. Earlier feed concurrency caused MySQL deadlocks and lock-wait timeouts in `upsertContentPage`.

## Changes

- Keep the safe Q1 feed concurrency default at 1. `SYNC_FEED_CONCURRENCY` can still explicitly override it after a future transaction redesign.
- Retry the entire `upsertContentPage` transaction for `ER_LOCK_DEADLOCK` and `ER_LOCK_WAIT_TIMEOUT` only.
- Default to four total transaction attempts with exponential backoff and jitter.
- Set the transaction connection's session lock-wait timeout to 30 seconds so normal contention can queue before reaching the retry path.
- Validate sync-run ownership without `FOR UPDATE`; the final fenced run update still rejects a lost lease.
- Sort each page by `externalId` for database writes so overlapping feeds acquire content locks in a stable order, while restoring results to the connector's original item order.
- Keep transaction-local result arrays and counters inside each attempt to prevent double counting after rollback.
- Keep the post-commit checkpoint read outside the retry boundary so a read failure cannot replay an already committed transaction.

## Configuration

- `SYNC_UPSERT_MAX_RETRIES`: total transaction attempts, default `4`, minimum `1`.
- `SYNC_UPSERT_RETRY_BASE_MS`: base exponential backoff, default `80`, minimum `0`.
- `SYNC_UPSERT_LOCK_WAIT_SECONDS`: session lock-wait timeout, default `30`, minimum `1`.
- `SYNC_FEED_CONCURRENCY`: Q1 feed concurrency, safe default `1`, minimum `1`.

## Verification

- `node --check server/src/db/repository.js`: passed.
- `node --check worker/src/worker.js`: passed.
- Focused `upsertContentPage` tests: 10/10 passed.
- Worker tests: 34/34 passed.
- New tests cover deadlock recovery without duplicate return counters, stable content lock ordering with original result ordering, non-lock error passthrough, retry exhaustion, and the safe default feed concurrency.
- Four real daily validations with feed concurrency 4 ended `partial/PARTIAL_SYNC` (exit 2), in 1,226s, 1,293s, 1,181s, and 1,182s. Analysis was correctly skipped with `COLLECTION_NOT_COMPLETED`.
- InnoDB diagnostics showed two distinct deadlock chains: sync-run S-to-X lock upgrades, then a cycle between `po_sync_run_contents` association locks and the shared `po_sync_runs` counter row. Moving scope validation before the transaction removed the first chain; the second remains under feed concurrency.
- Because the zero-lock-error acceptance criterion was not met, the default feed concurrency was returned to 1 and phase A was not started.
- Full repository test baseline: 56/59 passed before the new tests; three unrelated existing failures remain in `insertAlert`, `getAlert`, and `getOverview` tests.

## Follow-up

After a real daily crawl confirms stable concurrent collection with no terminal lock errors, implement phase A: enqueue analysis during collection and overlap the bounded analysis drain with collection.
