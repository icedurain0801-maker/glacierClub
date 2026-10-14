# Last Night ckYn3w AI queue guard incremental QA

Status: CANDIDATE_STAGE_GO / REAL_AI_AND_DAILY_NOT_YET_ACCEPTED
Date: 2026-10-09 (Asia/Shanghai)
Scope: independent offline retest of the replacement package. No live database, provider, Store, AI worker or scheduling operation was performed.

`8fcFb4` is withdrawn and must not be executed. The replacement `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/lastnight-runtime-ckYn3w` has `QA_PENDING_NOT_DEPLOYED` status. Independent `verifyInventory` passed 534/534 both before and after the test run. The candidate command SHA256 matched its manifest: `1498fb45969120d97f9de9f0782a74b2d4d5d1ba07698ef54c345628f048498f`.

The affected-file command in `v017_lastnight_complete_ai_queue_guard.md` exited 0 with 19 tests passed, 0 failed. The new shared queue guard requires `queue_result`, `EXACT_AI_QUEUED`, an empty `remaining` array, and one-to-one ID/fingerprint coverage of every inserted or changed `after` row. It rejects partial, missing, extra, duplicate content/job, and fingerprint-mismatched queues before analysis SQL. The authenticated journal recovery test also rejects partial queue evidence through the actual `observe-ai` entry. Unchanged behavior relies on the previously independently run 35/35 offline baseline; this is not a claim that the new full package had 35 tests rerun.

| Stage | Candidate verdict | Boundary |
|---|---|---|
| `store-ai` | GO for one manager-controlled, approved bounded attempt | Fresh 534-file inventory and exact plan/identity/window must pass at execution; runtime schema guard must pass. A Store commit is not AI completion. Nonzero after commit requires evidence review, not blind rerun. |
| `requeue-exact` | GO for a committed, authenticated journal only | Exact changed IDs; queue success is not AI completion. Commit-unknown requires read-only reconciliation. |
| `observe-ai` | GO for a complete authenticated `queue_result` only | The fixed guard rejects partial evidence. Final PASS still requires real completed job plus matching content fingerprint, version, profile and analysis row for every changed item. |
| `restore-content` | GO only for committed journal, no existing AI job and successful CAS | Partial content restoration; new history and memberships are retained. It is not a full rollback. |
| Full overseas chain and daily/02:00 | NO_GO | No real Store/AI completion or full-day, three-site pagination, durable slot and 02:00 entry evidence yet. |

The project manager supplied one-time read-only evidence for unique indexes on source/external content, content/profile/version jobs, account/content/feed membership and source/scheduled slot; QA did not repeat the live query. Domestic post-cutover PASS remains frozen and was not rerun.
