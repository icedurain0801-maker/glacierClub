---
status: prepared-for-qa
candidate: v029-bigplayer-migration-api-20260920-1931
schema_min: 026_scheduler_runtime_schema_reconciliation.sql
schema_target: 028_bigplayer_scheduled_site_runs.sql
---

# v029 BigPlayer migration + API candidate

## Scope

- `migrations/027_bigplayer_multisite.sql`: BigPlayer site registry, nullable parent/site run identity, checkpoint site identity, and resumable parent FK creation.
- `migrations/028_bigplayer_scheduled_site_runs.sql`: scheduled-site child trigger constraint.
- `server/src/db/migrate.js`: explicit 027 prerequisite version/schema gate; missing `window_start` and related 023 fields fail fast before SQL execution.
- `server/src/db/repository.js`: 027 is required by scheduler readiness and migration ledger query uses five placeholders.
- `server/test/app.routes.test.js`: route fixture explicitly includes `parent_run_id` and `site_id`.
- Existing API fixes included in the runtime: source/account identity preservation in `connectorAccountHealth` and stable auth error passthrough.

## Evidence

| Check | Result |
|---|---|
| Empty database 001 -> 028 | PASS |
| Old schema 001 -> 026, then 027/028 | PASS |
| Re-run after 027/028 ledger removal | PASS |
| FK DDL applied but ledger absent, then rerun | PASS |
| Missing 023 prerequisite column | PASS, `MIGRATION_027_PREREQUISITE_NOT_READY` |
| Migration schema nullability/FK/index audit | PASS |
| API routes + auth refresh | 69/69 PASS |
| Repository + migration contracts | 154/154 PASS |
| Production read-only DDL preflight | MariaDB 10.4.14; 15,076 sync runs; no lock waits; `parent_run_id/site_id` absent |

## Candidate

- Isolated path: `.temp/candidates/v029-bigplayer-migration-api-20260920-1931/`
- Manifest SHA256: `B05DFA1084A881089EEB9AD155341CB96BECF5BE4C7DC08BE851818BED659256`
- Earlier isolated build `v029-bigplayer-migration-api-20260920-1930` is invalid because its directory had an accidental `+` prefix; it was not installed or reused.
- Candidate is isolated and not installed in `C:\ProgramData`; production migration, API cutover, Worker/Login Session restarts, and sync remain frozen.

## QA handoff

QA must independently verify the manifest, migration sequence, empty/old-schema upgrade, idempotent rerun, interrupted-FK recovery, fail-fast prerequisite gate, 69/69 regression, and production read-only evidence. Any failure invalidates this candidate; do not repair or reuse it.
