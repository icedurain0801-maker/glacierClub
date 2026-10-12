# Domestic BigPlayer first-segment v8 SQL incremental QA

Status: CONDITIONAL_GO_ONE_PAGE_ONLY / LIVE_RECONCILIATION_PENDING
Date: 2026-10-09 (Asia/Shanghai)
Scope: domestic board-2 merged home posts, source `5c21f78d-5f67-4467-963d-dcdeb5e26cab`, account `70c393cf-9600-11f1-b3d2-d85ed3ae61b0`, window `[2026-10-08T16:00:00.000Z, 2026-10-09T04:31:29.177Z)`. No QA production HTTP/DB write.

## Incremental evidence

- v6 real attempt returned `FAILED_TODAY/ER_PARSE_ERROR`; its old output is retained. Manager read-only postcheck found the recovery checkpoint idle, null cursor, zero fetched items, no lease/error and today's target count zero. This does not prove no provider HTTP occurred. v6 and v7 must not be executed.
- Adapter page UPDATE now quotes the MariaDB reserved identifier as ``SET `cursor`=?``. Frozen release `claimSyncCheckpoint` has no cursor assignment and `releaseSyncCheckpoint` already quotes it. The manager reports a real MariaDB `EXPLAIN UPDATE` of the complete new statement with bound parameters passed (`exit=0`, `parsePassed=true`, `executedDML=false`). This database-parser result is manager-relayed, not a QA-issued production query.
- CLI failure report now uses fixed phase labels (`identity_read`, `source_account_read`, `schema_read`, `validate_scope`, `account_lock`, `checkpoint_read`, `checkpoint_claim`, `provider_page_detail`, `store_page`, `ai_enqueue`, `checkpoint_release`) plus a sanitized error code; it does not emit SQL text, credential or provider payload.
- Current v8 unapproved plan SHA256 `4482f7e1273911093a5d985b11eb7bdb4e86ca2947bdc4b415e95a5e2c373821`. Fresh `inventory()` matched all 111 files and hashes. CLI actual and planned SHA256 both `bb23a9375a535f585038ae3af2a84e8eddf5fa6794a200cec08a0c97a2a49a59`. Plan is `approved:false`, `maxPages:1`; its new output `first-segment-v8-execution.json` does not exist. Passing it unapproved to `--approved-plan` exited 1 with `DOMESTIC_APPROVED_PLAN_REQUIRED`. CLI/adapter syntax checks passed.
- The underlying recovery suite was freshly rerun on the v7 SQL correction: 10/10 passed. v8 changes only phase reporting and its plan output, while the frozen 111-file inventory captures those changes. Isolated tests do not substitute for the real post-run reconciliation.

## Gate

**Conditional GO** for the project manager to execute exactly one approved copy of v8, preserving source, account, window, `maxPages=1`, 111-file map and CLI hash, with the unique new output path. No v1-v7 plan may be retried. If any runtime identity/site/schema/lock check fails or the SQL/commit outcome is uncertain, stop without blind retry.

The output must be followed by read-only reconciliation of all 16 captured external IDs and UTC timestamps, complete provider detail/raw digest, target DB source/account/community rows and published times, AI jobs or explicit no-text exclusion, and checkpoint cursor/status. `missingExpectedIds` nonempty means partial progress. AI queued does not mean AI completed. Other feeds, comments, replies, the full day and today UI remain unaccepted.
