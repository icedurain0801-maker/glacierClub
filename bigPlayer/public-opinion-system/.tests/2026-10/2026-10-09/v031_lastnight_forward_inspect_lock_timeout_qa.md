# Last Night x5YQo8 inspect pass / execute lock timeout QA

Status: INSPECT_PASS / EXECUTE_NO_GO_PREPARE_NOT_REACHED
Date: 2026-10-09 (Asia/Shanghai)
Scope: independent local examination of manager-produced result/plan files and evidence directories. No live DB/provider query, retry or mutation by QA.

## Observed

- `inspect-forward-resume-result.json` reports `LAST_NIGHT_FORWARD_INSPECT_READY`, snapshot hash `4baf722c4b7c1d253b899b4f04ddd3944433a9436f9c8248e3916ef348130517`, checkpoint hash `4c07cd98cd0f4f4f6a41fb1e2869992f11e480730cc0c7f5372e9f9100761a1b`, saved `offset20/pageIndex2`.
- Approved execute plan binds the same snapshot hash, base journal SHA256 `54e8bf24b853b94917339b691e1a1dfe1da16980aa24992cb6e51abe37f67a5b`, epoch-1537 session journal SHA256 `a30317f2946a2871bf9a64dfd6d8c76f27b30f3a79c61ea4fa2240b9d56c3819`, manager failure-postcheck SHA256 `0431706d5b46c526feacb301f57ea49c85167b40f2cdda98d851ea3c9861de8f`, frozen 544+5 inventory and CLI SHA256 `fc3636f062d2d16625711997c27e9e7fc6dd8fdd07417820ef1d646807f72c9a`.
- `execute-forward-resume-result.json` reports `NO_GO/ER_LOCK_WAIT_TIMEOUT`, `fullChainComplete=false`; manager reports exit 1. Both candidate `protected/` and `public/` evidence directories were empty at QA observation. No diagnostic contract, provider payload or page-commit journal exists for this attempt.
- Manager-produced read-only `lock-timeout-readonly-postcheck.json` SHA256 `b3c629634e1f7a3c82f124f6555b6640cf35932f22f5a491798ad0e73395f1ef` was independently rehashed, including the two report SHAs. It reports source owner/epoch unchanged at `0c4.../1537`, checkpoint still `idle`, `itemsFetched=16`, `offsetId=20/pageIndex=2`, null checkpoint lease/error, zero active runs and empty evidence directories. At capture time no InnoDB waits were visible; one running transaction had zero rows locked/modified. The historical blocker and precise timed-out statement were **not** captured.

## Ordering conclusion and limit

The executable calls `resolveLastNightRuntime` before `forwardResume`. Within `forwardResume`, it takes account GET_LOCK, starts a transaction and locks source/schedule/account/registry/checkpoint/active-run state **before** `persistEvidence(forward_resume_prepared)`. That fsynced protected journal precedes source-owner CAS UPDATE; a fsynced public diagnostic contract precedes the first HTTP request. Given the intact, empty evidence directories, the observed attempt did not reach the owner-update admission point or HTTP. The exact SQL operation that timed out is **not established** by the generic result; it may be runtime resolution or one of the pre-journal locking reads. This is not an account-permission classification.

The observed postcheck confirms no owner/cursor drift. Its real `EXPLAIN` shows the active-run OR predicate used `po_sync_runs_queue_idx` (estimated 5 rows) and the account-wide running-checkpoint query used `po_sync_checkpoints_account_idx` (estimated 4426 rows); `SELECT ... FOR UPDATE` also joins source to game/community. These are plausible lock-amplification paths, **not proof of the historical blocking statement**. Do not retry the old entry, kill a connection, restart a service, reset a lease, or change domestic workers on this evidence. A newly frozen, narrower-lock candidate needs independent QA. Preserve the successful prior page-1/site-2 findings; page 2 and full-chain release remain **NO_GO**.
