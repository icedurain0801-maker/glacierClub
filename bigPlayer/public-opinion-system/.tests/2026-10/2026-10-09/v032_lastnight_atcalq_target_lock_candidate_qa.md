# Last Night AtcaLQ target-lock candidate independent QA

Status: NEW_INSPECT_CANDIDATE_GO / ONE_OFFSET20_EXECUTE_CONDITIONAL_GO / FULL_CHAIN_NO_GO
Date: 2026-10-09 (Asia/Shanghai)
Scope: offline frozen-byte and code/test review only. QA made no live DB/provider query, approved plan execution, DDL, connection termination, or domestic restart. Prior x5YQo8 execution eligibility is withdrawn; its evidence remains preserved.

## Candidate identity and commands

- Candidate `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/lastnight-forward-AtcaLQ`, manifest SHA256 `49238de34dd03273acd5866de7d758d16ec49233fe938b2eb5842a033a12a3fc`, CLI SHA256 `9470f844722cfb751494babd7e07c6286415f87a638a3277dbaaed0aeb0e1e4e`. `verifyForward(manifest)` independently reports **base 544/544 + forward 7/7**. Any byte change voids this verdict.
- `node --test worker/test/lastNightForwardResume.test.js worker/test/lastNightRecoveryFailureContract.test.js worker/test/lastNightForwardSuccess.test.js worker/test/lastNightTargetLockAdapter.test.js`: **12/12 PASS, exit 0**. Tests use fake DB/connector; AES-GCM and Repository methods are real implementations, not a live CLI/DB/provider E2E.
- `node scripts/lastnight-forward-resume.js --approved-plan <AtcaLQ unapproved inspect template>`: exit 1, `LAST_NIGHT_APPROVED_PLAN_REQUIRED`, before DB/HTTP.

## Lock-scope review

- The same wrapped query function is used in `forwardResume` and passed to `recoverFirstSite16Page`; the latter's active-run OR statement matches the adapter's exact string. `START TRANSACTION` first sets `READ COMMITTED` for this connection. Account GET_LOCK, source owner/epoch CAS and page source/lease fences remain in place.
- The joined `po_sources`/`po_games`/`po_communities FOR UPDATE` is replaced by a source `PRIMARY` row lock plus non-locking game/community reads, with fixed game/community ID checks. The active-run OR query is split into source and account predicates with explicit existing `po_sync_runs_source_status_lease_idx` and `po_sync_runs_account_status_created_idx`. The account-wide running-checkpoint query is split into the three authorized sites using `po_sync_checkpoints_site_idx`. A missing named index fails SQL; the candidate issues no DDL.
- The adapter labels a database failure with a fixed `lockStage` enum; CLI output filters that enum and omits SQL, parameters and credentials. This improves the next diagnostic, but does not prove which statement blocked the prior x5YQo8 attempt.
- Remaining row locks are purposeful exact source/schedule/account/checkpoint/content and run-range locks. Under `READ COMMITTED`, missing-row scans avoid the prior broad gap-lock pattern, while correctness still relies on the account mutex and source epoch checks. The adapter's isolated tests verify emitted SQL shape, not real InnoDB lock footprints or every pagewriter branch under concurrency.

## Decision

**Candidate GO** for project-manager serial `inspect-forward-resume` using a newly approved AtcaLQ plan and fresh output. The old x5YQo8 snapshot hash must not be reused. If live inspect returns the expected source/account/site/checkpoint at saved `offset20/pageIndex2`, no competing run/checkpoint and a new snapshot hash, then **conditional GO for exactly one AtcaLQ execute** binding that hash, new owner/output and the authenticated base/session/postcheck inputs. Stop on any lockStage/error, source or checkpoint drift, detail incompleteness, timeout or COMMIT uncertainty; do not blind retry. Return protected/public journal hashes, redacted diagnostic and exact DB postcheck to QA.

The manager separately reported read-only `EXPLAIN` for the new SQL: source-run and account-run queries each used the requested index with estimated 5 rows; the site-checkpoint query used `po_sync_checkpoints_site_idx` with estimated 1 row. QA has not independently read that SQL-result artifact; absence of a named index remains NO_GO, not a migration request. Prior site-2/site-16-page-1 PASS remains bounded. Page 2, remaining feeds/comments/AI, domestic frozen-baseline comparison and unique daily 02:00 owner are not established. Full-chain release remains **NO_GO**.
