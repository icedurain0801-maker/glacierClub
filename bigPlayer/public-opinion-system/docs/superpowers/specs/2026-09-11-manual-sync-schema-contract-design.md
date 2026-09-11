# Manual Sync Schema Contract Design

Date: 2026-09-11
Status: approved via project-manager delegation (`用户已弹窗拍板`)

## Goal

After migration 023, create exactly one auditable `manual` sync run for one explicitly selected source without enabling the source, resetting history, consuming unrelated due sources, or touching production during development.

## Considered approaches

1. Patch only `createSyncRun` to add `source_id`. This closes the immediate `NOT NULL` error but leaves source validation, concurrency checks, disabled-source behavior, and idempotency split across callers.
2. Add a dedicated transactional manual-enqueue boundary and route all source manual start/reset calls through it. This is selected because one repository transaction can lock and validate the source/account state, reject competing work, and create one run with a complete audit identity.
3. Reuse `collect_requested_at`. This is rejected because the Worker consumes it together with other queued/manual/periodic work, so it cannot prove “one requested source, one run.”

## Repository contract

- `createSyncRun` requires `sourceId` and writes `source_id`, `account_id`, `trigger_type`, `status`, `sync_mode`, and `started_at` explicitly.
- Worker-created periodic runs pass `trigger_type='scheduled'`; source API-created runs pass `trigger_type='manual'`.
- A dedicated source manual-enqueue transaction:
  1. verifies migration 023 schema readiness and fails closed on old/incomplete schema;
  2. locks the selected source row;
  3. verifies the source is enabled and its game/community are enabled;
  4. verifies the chosen account is the source default account, belongs to that source, is enabled and authorized, and neither source nor account authorization is expired;
  5. returns an existing queued/running manual run for the same source and mode with `reused=true`;
  6. otherwise rejects any active run, active checkpoint, or unexpired source-scheduler lease;
  7. inserts exactly one queued run with `source_id=<selected>`, `account_id=<default>`, `trigger_type='manual'`, and requested sync mode;
  8. commits and returns the run.
- Duplicate requests are idempotent only for the same source and mode. Other active work remains a conflict and creates nothing.
- `reset` may reset checkpoints only after the same admission checks pass, then creates one manual backfill run in the same transaction. It must not auto-enable the source.

## API behavior

- `POST /api/public-opinion/sources/:id/sync` remains the precise manual endpoint.
- It resolves the account from the locked source/default-account relationship; callers cannot substitute another source/account/community/region.
- Disabled source, old schema, active work, ownership/auth expiry, and lease conflicts map to stable fail-closed error codes.
- The legacy `/collect` endpoint remains outside this precise-run contract and is not used for controlled production recovery.

## Error contract

- `UNIFIED_SCHEDULER_SCHEMA_NOT_READY`
- `UNIFIED_SCHEDULER_SCHEMA_CHECK_FAILED`
- `SOURCE_DISABLED`, `GAME_DISABLED`, `COMMUNITY_DISABLED`
- `ACCOUNT_NOT_FOUND`, `ACCOUNT_DISABLED`, `OWNERSHIP_MISMATCH`
- `SOURCE_UNAUTHORIZED`, `SOURCE_AUTH_EXPIRED`
- `ACCOUNT_UNAUTHORIZED`, `ACCOUNT_AUTH_EXPIRED`
- `PREVIOUS_RUN_ACTIVE`, `SYNC_CHECKPOINT_ACTIVE`, `SOURCE_SCHEDULE_LEASE_ACTIVE`

No failing path may enable a source, clear a checkpoint, reset a lease, or insert a run.

## Test design

- Repository unit tests assert every run insert includes `source_id` and the correct trigger type.
- Transaction tests cover enabled/manual success, exact persisted values, duplicate idempotency, disabled-source rejection, account/source ownership, authorization expiry, active run/checkpoint/lease conflicts, rollback, and old-schema fail-closed behavior.
- API route tests assert the endpoint creates one queued manual run, returns `reused` on duplicate requests, rejects disabled sources without mutation, and surfaces stable error codes.
- Worker tests assert scheduled enqueue calls carry the source ID and scheduled trigger type.
- Migration contract tests continue to assert the 023 `NOT NULL`/index definitions required by the repository contract.

## Scope boundary

This task changes local code, tests, and change records only. It does not apply migration 023, restart Worker, enable sources, inspect or repair real credentials, start real sync work, write production data, deploy, release, or push.
