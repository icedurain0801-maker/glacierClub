# Domestic BigPlayer first-segment v6 TLS incremental QA

Status: REVOKED_AFTER_LIVE_ER_PARSE_ERROR / DO_NOT_RETRY_V6
Date: 2026-10-09 (Asia/Shanghai)
Scope: v6 startup correction only. The prior v5 plan was revoked after `DOMESTIC_DB_TARGET_MISMATCH` before DB/HTTP and before an output artifact. Do not retry v5.

Post-handoff update: the manager reports v6 wrote `first-segment-execution.json` with `status=FAILED_TODAY`, `errorCode=ER_PARSE_ERROR`. A read-only postcheck found the new checkpoint idle with null cursor, zero fetched items, no lease/error, and today count still zero. This does not establish that no provider HTTP call occurred. The new adapter's `UPDATE po_sync_checkpoints SET cursor=?` used an unquoted MariaDB reserved identifier; v6 is revoked and must not be retried. The conditional gate below is historical only.

## Independent delta verification

- Candidate `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/domestic-today-recovery-20261009/plan-first-segment-v6.unapproved.json` SHA256 `cf20030024da6f16b36572e16f01cf7a2aff22efd926324dc0fd8b628274bb9b`, `approved:false`, `maxPages:1`, captured window `[2026-10-08T16:00:00.000Z, 2026-10-09T04:31:29.177Z)`.
- Fresh runtime inventory matches all 111 planned file paths and hashes. CLI actual and planned SHA256 both `64b32fa5339c0058e6e74d8aee4680979180ba7791e358e6222b14d6e23b8c9e`.
- `scripts/domestic-today-recovery.js` sets `NODE_TLS_REJECT_UNAUTHORIZED='1'` immediately before and after `process.loadEnvFile` in its own process. It retains exact `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_NAME=public_opinion`, and absent `DATABASE_URL` checks. It does not edit the env file, shared service, task, or TLS trust policy.
- Fresh `node --test worker/test/domesticTodayRecovery.test.js`: 10 pass, 0 fail. The bounded Connector, legacy SQL, rich detail, AI no-text, replay and checkpoint baseline is unchanged from v5. No QA production DB or provider HTTP call was made.

## Gate

**Conditional GO** for the project manager to approve an exact v6 copy and execute one `maxPages=1` domestic home-post segment with a new, nonexisting output artifact. Runtime source/site/account/identity/schema/lock checks must still pass. Any further startup failure or inventory drift is NO_GO; do not retry an older plan.

After the run, independently reconcile the 16 captured IDs and their UTC times to persisted source/account/community rows, full detail/raw hashes, AI job or no-text exclusion, and checkpoint status/cursor. A shifted live first page can leave `missingExpectedIds`; that is partial progress, not 16/16 completion. `aiQueued` is not AI completed. Other feeds, comments, replies, whole-day completeness and today UI remain outside this gate.
