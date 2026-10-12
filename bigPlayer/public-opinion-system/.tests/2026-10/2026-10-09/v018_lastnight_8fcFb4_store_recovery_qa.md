# Last Night 8fcFb4 Store and recovery incremental QA

Status: PARTIAL_CANDIDATE_GO / OBSERVE_AI_NO_GO / FULL_CHAIN_NO_GO
Date: 2026-10-09 (Asia/Shanghai)
Scope: independent static and offline fixture review. QA did not connect to the live database or provider, execute an unapproved plan, or change business code, data, configuration or tasks.

## Frozen package and independent checks

- Package: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/lastnight-runtime-8fcFb4` (`QA_PENDING_NOT_DEPLOYED`). Supersedes `VihCyj` and `Tgsgk0`.
- `verifyInventory(manifest.json)` independently passed for all 534 current files; candidate command SHA256 matched manifest (`1498fb45969120d97f9de9f0782a74b2d4d5d1ba07698ef54c345628f048498f`). This is a snapshot: any subsequent source/dependency change invalidates the package.
- Independent command listed in `v016_lastnight_executable_store_recovery.md` completed with exit code 0: 35 tests, 35 passed, 0 failed. It covers actual Repository legacy insert SQL, fixed payload scope, authenticated journal tamper/prepared rejection, bounded connection/SQL/queue/restore negatives, commit-unknown and CAS conflict cases. All are offline fixtures.
- Project manager's one-time read-only live index observation: `po_contents(source_id,external_id)`, `po_analysis_jobs(content_id,analysis_version,analysis_profile)`, `po_content_feed_memberships(account_id,content_id,feed_key)`, and `po_sync_runs(source_id,scheduled_at)` are unique. No `source+fingerprint` unique index was observed. QA did not repeat this query.

## Stage verdicts

| Stage | Candidate verdict | Limit |
|---|---|---|
| `store-ai` | GO for one project-manager-controlled bounded attempt, conditional on a fresh inventory check, approved exact account/window/plan, and runtime schema guard | A successful Store commit is not AI completion. The stage exits nonzero until exact AI evidence is complete; a nonzero exit after commit must not trigger blind rerun. The prior nine-post report lacks bodies, so one necessary bounded same-window re-read is expected. |
| `requeue-exact` | GO only for a committed authenticated journal and exact account/version after incomplete queue | Queue success proves enqueue, not AI completion. Commit-unknown requires read-only reconciliation before retry. |
| `restore-content` | GO only as a last-resort, project-manager-controlled partial CAS recovery from a committed journal before any AI job exists | Existing AI job or row conflict rejects restoration; newly inserted history and feed memberships remain. It is not a full rollback. |
| `observe-ai` | NO_GO | A partial `queue_result` journal can be observed as `EXACT_AI_COMPLETED` for only its queued subset while changed content remains unqueued. |
| Daily slot / pagination / 02:00 entry | NO_GO | Not covered by this Store package; current daily schema and full-day evidence remain separate. |

## Defect returned to development

`lastNightBoundedRuntime` records `queue_result` even when `queueExactChanges` returns `STORE_COMMITTED_QUEUE_INCOMPLETE`. `runRecovery` allows `observe-ai` whenever `evidence.queue.queued` exists; `observeExactAnalysis` only checks those queued IDs. If three changed items exist but only one was queued and analyzed, the observer can return `EXACT_AI_COMPLETED`. Require queue status success, empty remaining set, and exact equality between queued identities and the inserted/changed entries in authenticated evidence before declaring completion. Add a partial-queue negative fixture, then re-freeze the complete package. Until then, no `observe-ai` success is accepted as full AI closure.

Domestic post-cutover read/UI PASS remains frozen and was not rerun. No full-day, three-site, asynchronous AI or daily scheduler PASS is claimed.
