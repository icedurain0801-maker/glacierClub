# Overseas BigPlayer first offline candidate and active-consumer gate

Status: PARTIAL_OFFLINE_68_PASS / MANIFEST_CLOSURE_INCOMPLETE / RUNTIME_NO_GO
Candidate: `.Codex/docs/2026-10/2026-10-09/v041_overseas_candidate1_manifest.json`
Runtime observed: PID 19584, `C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1/worker/src/worker.js` (process command line read-only verified)

## Independent results

- Recomputed all 17/17 v041 file SHA-256 values before and after the test; no selected-file drift at those observations.
- Independently executed the manifest's exact `node --test --test-concurrency=1` command: TAP 68 tests, 68 passed, 0 failed, exit 0. These are offline fixture results, not provider/Store/scheduler/translation success.
- The command names 12 test files, but 8 direct test files are absent from v041's file hash list: `bigplayerRegionIsolation`, `bigplayerOverseasAuthorization`, `bigplayerApiAuthorization`, `sourceValidators`, `bigplayerDedupContract`, `dailyQ1Shutdown`, `sourceScheduler`, and `schedulerRepositoryAdapter`. Runtime transitive modules (including `overseasBigPlayerPageStore.js`) and installed dependencies are also not frozen by those 17 hashes. Await a new full-closure manifest and repeat the hash/test sequence; v041 cannot identify a complete executable version.
- Source review supports overseas-only site identity and per-source/account/board/site/URL/token cache keys in `server/src/connectors/overseasBigPlayerSiteSession.js`. `BigPlayerH5Connector.loadApiToken` loads `account_password` first; a login failure is terminal rather than falling back to stored token. The independent fixture command covers these branches, but no live provider authorization or content request was made by QA.
- `worker/src/overseasBigPlayerCommentTargets.js` includes unchanged current-page posts and keyset traversal of old posts, checks source/account/game/community/site/board, and fails on stalled cursor, foreign rows or coverage gaps. Live older-parent comments/replies remain unverified. `worker/src/overseasBigPlayerPageStore.js` and `overseasBigPlayerPageJobs.js` are new isolated modules; source search found no main `worker.js` call to construct the adapter or invoke PageStore/PageJobs. Their existence is not a wired real chain.
- `v062_overseas_schema_readonly_qa.js` returned `SCHEMA_GAP` at DB UTC `2026-10-09 06:49:26.475`: `po_contents` has none of `board_id`, `board_name`, `board_key`; `po_sync_runs` has neither `board_id` nor `site_url_snapshot`. No DDL was executed. The candidate's overseas-only legacy adapter and external immutable run contract need full transactional integration, fail-closed behavior and independent retest before Store admission.

## Active shared Worker exclusion: NO_GO

The deployed `worker.js` uses `sourceAllowlist` only in `runUnifiedSchedulerSeam` (around lines 1227-1254). Its `runOnce` still reads all runnable runs before that scheduler (around 1299), reads and clears due manual markers (1308-1313), falls back to unfiltered `listDueSources` (1318), and polls newly runnable manual runs during a scan (1346-1379). Deployed `workerScanLease.js` globally recovers expired/old queued runs without overseas exclusion (around 23-33). The deployed repository's `listRunnableSyncRuns`, `listManualDueSources` and `listDueSources` select enabled sources without a region/platform exclusion. `claimSyncRun` updates the run lease before `withAccountLock` in the later paged execution path (deployed `worker.js` around 1062/1084 versus 962/1024). Therefore a new independent overseas consumer could race the live shared worker even if no old Last Night-specific process exists.

`v043_overseas_consumer_takeover_design.md` proposes one shared consumer with trusted three-state routing, but remains `DESIGN_ONLY`; the current PID cannot hot-load that worktree plan. No route, drain, all-entry ownership filter, in-flight/lease safety or rollback was executed. Do not start a second consumer, restart/stop PID 19584, change shared build or trigger a real run under this QA result. Old overseas code cleanup is deferred by the latest user decision and is not a failure criterion.

## Separate gates

| Gate | Current result |
|---|---|
| First-source selected offline code | 68/68 tests pass; incomplete dependency lock, no full candidate acceptance |
| Second source | Config board/registry gap independently confirmed in v057/v058; developer's limited context HTTP 401 is not independent proof of permanent account denial or actual board |
| Current DB write contract | NO_GO: missing columns; overseas-only adapter and immutable run contract not wired/verified |
| Single consumer | NO_GO: deployed shared worker still has multiple overseas intake/recovery paths |
| Real manual HTTP -> body/parent graph -> DB -> AI/translation -> UI | NOT RUN / NO_GO |
| Next actual scheduled slot and domestic/Discord/TapTap/Facebook regression | NOT RUN / NO_GO |

No production configuration/data write, provider collection, service switch, Worker restart, or 3001 use was performed by QA.
