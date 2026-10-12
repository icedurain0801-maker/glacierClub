# Domestic BigPlayer 2026-10-09 first-segment v5 independent QA

Status: REVOKED_AFTER_PREFLIGHT_FAILURE / DO_NOT_RETRY_V5
Date: 2026-10-09 (Asia/Shanghai)
Scope: domestic source `5c21f78d-5f67-4467-963d-dcdeb5e26cab`, account `70c393cf-9600-11f1-b3d2-d85ed3ae61b0`, community 101, board 2 merged home posts. Captured window `[2026-10-08T16:00:00.000Z, 2026-10-09T04:31:29.177Z)`.

Post-handoff update: the manager reports the first v5 launch stopped at `DOMESTIC_DB_TARGET_MISMATCH` with no output artifact and no DB or provider HTTP call. The inspected safe environment showed `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_NAME=public_opinion`, `DATABASE_URL` absent, and inherited `NODE_TLS_REJECT_UNAUTHORIZED=0`. The original conditional GO below is revoked; v5 must not be retried. A new frozen candidate requires separate QA.

## Independent verification

- Candidate: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/domestic-today-recovery-20261009/plan-first-segment-v5.unapproved.json`, SHA256 `6e197add980cacd1b39deac479755932b444626edf398a2356fa2364b2d82b12`. It is still `approved:false`, `maxPages:1`, and specifies the exact source, account, half-open window, local DB identity and release. Prior v1-v4 plans are revoked.
- Fresh `inventory()` matched all 111 v5 file paths and SHA256 values exactly. CLI SHA256 matched `ab3567dfa7b2d5b349ccd9c9854a956be5fa1ae762bd3aa376ca2c664e88b6e1`. No production execution output exists at review time.
- Fresh `node --test worker/test/domesticTodayRecovery.test.js`: 10/10 pass, 0 fail. This includes actual frozen-release Connector fixture, legacy SQL transaction fixture, yesterday pinned-row filtering before detail requests, complete raw media/opaque detail with empty body, titleless no-text AI exclusion, AI failure replay, checkpoint fencing, and offset-ceiling noncompletion. Tests are isolated, not live provider or DB writes.
- Static v5 delta separates `contentIds` (all persisted IDs), `aiContentIds` (eligible nondeleted title/body inputs), and `storedExternalIds`. The 16 `expectedFirstPageIds` match the manager's read-only evidence; `missingExpectedIds` is computed from actual processed IDs. This avoids reporting AI-only IDs as the complete stored set or claiming all 16 were on a later moving first page.
- Repository adapter uses the existing source/external identity, READ COMMITTED, checkpoint lease and same shared-account advisory lock, legacy columns without board DDL, UTC collection timestamps, and a readback owner/fingerprint check. Real identity, source/site configuration, column presence, credentials and lock availability remain execution-time fail-closed checks, not independently live-verified in this QA session.

## Gate and limits

**Conditional GO** for the project manager only to approve an exact v5 copy and run the one-page bounded first segment, with a fresh nonexisting output path. The copy must preserve the 111-file mapping, CLI hash, source/account, capture end and `maxPages=1`; no old plan may execute. QA does not run production HTTP/DB, start/restart shared Worker, modify tasks or touch overseas collection.

After execution, status and counts alone are insufficient. Read-only reconciliation must compare the 16 captured external IDs and provider timestamps to target source/account/community DB rows, full detail/raw hashes, body/media/deletion, AI job or explicit no-text exclusion, and checkpoint cursor/status. The provider's page may have shifted since the 04:31:29Z capture; `missingExpectedIds` nonempty means only partial progress, requiring a new separately bounded continuation. `aiQueued` means queued, not completed. An uncertain commit, changed inventory, scope mismatch, missing full detail, or unexpected shared-service change is NO_GO without blind retry.

This gate does not accept all feeds, comments, replies, the whole-day window, today UI or release readiness. No live collection success is claimed by this report.
