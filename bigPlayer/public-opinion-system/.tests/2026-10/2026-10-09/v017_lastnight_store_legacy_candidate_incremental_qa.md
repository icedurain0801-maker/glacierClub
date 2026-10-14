# Last Night legacy Store candidate incremental QA

Status: NO_GO_STALE_MANIFEST / STORE_AND_DAILY_NOT_RELEASED
Date: 2026-10-09 (Asia/Shanghai)
Scope: independent static and offline fixture review only. No live DB, provider, Store, AI, Worker or scheduling operation was performed.

## Baseline

- Existing real evidence proves only metadata and one-page collect: 12 successful HTTP requests, nine in-window enriched posts, `hasMore=true`, `stored=0`, AI not requested. See `v016_lastnight_real_metadata_one_page_qa.md`.
- Domestic post-cutover read/UI acceptance remains frozen as `PASS_POST_CUTOVER_DOMESTIC_READ_UI`; it was not rerun here.
- The current production schema observation says `po_contents` lacks `board_key` and `board_id`, while `po_sync_runs` lacks the daily candidate's community/board/site snapshot columns. These are project-manager-provided read-only observations, not a new QA database query.

## Candidate observations

- Legacy Store code routes existing content by source plus external ID, strips only absent board columns from the actual Repository insert, and adds fixed Last Night board scope to `raw_payload`; the real `_upsertContentPageAttempt` algorithm passed one no-board-column insert fixture. Existing rows without a provable board marker or with foreign account/game/community are rejected in code.
- The focused offline command `node --test worker/test/lastNightProtectedStore.test.js worker/test/lastNightWriteSchema.test.js worker/test/lastNightIsolatedStore.test.js` passed 6/6 at review time. These fixtures do not establish live schema/index compatibility, compensation, exact requeue, or AI completion.
- `VihCyj/manifest.json` reports `QA_PENDING_NOT_DEPLOYED`. Independent `verifyInventory` failed with `LAST_NIGHT_CANDIDATE_INVENTORY_INVALID`: manifest 533 entries versus current 534. `scripts/lastnight-bounded-runtime.js` and `worker/src/lastNightProtectedStore.js` had changed hashes; `worker/src/lastNightDeadlineConnection.js` was absent from the manifest. The earlier `Tgsgk0` package was already superseded. Neither package is executable QA evidence.

## Open gates

1. Store: wait for a stable full dependency and command hash freeze, then run production-shape schema and index fixtures with the actual Repository SQL, including existing-row and collision negatives. No live Store GO yet.
2. Compensation/requeue: independently verify total deadlines, commit-unknown handling, authenticated journal recovery, CAS and job conflicts, partial queue accounting, and stale completed exact requeue. Current focused fixture run does not cover these paths.
3. AI: exact queue rows are not analysis completion. Require matching real job/content fingerprint, version, profile and analyzed row evidence.
4. Daily: current schema is not compatible with the daily slot candidate; pagination, checkpoint, lease renewal, durable slot and 02:00 entry remain separate gates.

No DDL, new database, domestic Worker change, repeat of the nine-post collect, or live write was performed. Stale-manifest NO_GO was sent to project manager and development lead.
