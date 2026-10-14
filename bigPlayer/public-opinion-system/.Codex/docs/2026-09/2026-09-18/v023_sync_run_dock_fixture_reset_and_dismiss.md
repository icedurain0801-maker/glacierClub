# v023 Sync Run Dock fixture reset and dismiss

- Date: 2026-09-18
- Scope: `127.0.0.1:3000` in-memory acceptance fixture and Dock client only.

## Change

- Added `POST /api/public-opinion/fixtures/sync-runs/reset` with an empty JSON object body. It restores the non-real `fixture-sync-run-cancelable` record to `running`, `fetched_count=3`, `discovered_count=7` in adapter memory only.
- Dock dismiss now clears `publicOpinionActiveSyncRun` and the source-page `syncSourceId` / `syncRunId` deep-link. This prevents source recovery from recreating a dismissed Dock after a reload.
- Registered the delegated click listener in capture phase and advanced the dynamic Dock asset query to `v=3`.

## Verification

- `node --test ../admin/PublicOpinion/assets/sync-run-dock.test.js .tests/2026-09/2026-09-18/v220_acceptance_sync_run_fixture.test.js`: 7/7 passed.
- `node --check` passed for the changed Dock and fixture adapter files.
- HTTP against local adapter PID `40592`: `running 3/7` -> `cancelled` -> `running 3/7` after reset.

## Boundary

No access to 3001, 4320, database, provider, credentials, real synchronization, collection, or authorization.
