# Last Night x5YQo8 forward-resume candidate independent QA

Status: INSPECT_CANDIDATE_GO / ONE_OFFSET20_EXECUTE_CONDITIONAL_GO / FULL_CHAIN_NO_GO
Date: 2026-10-09 (Asia/Shanghai)
Scope: offline review and tests only. QA did not execute an approved plan, query live DB/provider, or mutate tasks/data. Domestic and other collectors/algorithm baselines remain frozen.

## Frozen bytes and tests

- Candidate `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/lastnight-forward-x5YQo8`, declared `QA_PENDING_NOT_EXECUTED`. Manifest SHA256 `744f5bfb421854977a81fe850ca6f8a11337188b36a0f0b021a232df12db7a47`; CLI SHA256 `fc3636f062d2d16625711997c27e9e7fc6dd8fdd07417820ef1d646807f72c9a`. `verifyForward(manifest)` independently passed: unchanged base 544/544 plus 5/5 forward files. The extra success test is outside this freeze and did not alter the 549 verified bytes.
- `node --test worker/test/lastNightForwardResume.test.js worker/test/lastNightRecoveryFailureContract.test.js worker/test/lastNightForwardSuccess.test.js`: **10/10 PASS, exit 0** (8 candidate/failure tests plus 2 supplemental success-path tests). `node scripts/lastnight-forward-resume.js --approved-plan <unapproved inspect template>`: exit 1, `LAST_NIGHT_APPROVED_PLAN_REQUIRED`, before DB/HTTP.
- The supplemental tests exercise real AES-GCM tamper rejection and actual Repository methods on a pinned fake connection, including legacy SQL adaptation, light AI enqueue, saved offset-20 cursor and one COMMIT. They are **not** CLI+real encrypted file+live DB/provider E2E.

## Admission review

- CLI requires explicit absolute approved plan, fixed authorization mode/stage/CLI hash, existing safe evidence directories, hashes of both encrypted journals, frozen inventory, strict TLS, local DB target and expected identity. Initial migration additionally requires the existing manager read-only failure-postcheck file and exact SHA. Current page-1 base journal, epoch-1537 `resume_committed` journal and postcheck are inputs; a bare pre-HTTP committed journal is not a repeatable failure receipt.
- Under a single account GET_LOCK/transaction, inspect locks current schedule, source, account, three-site registry and exact checkpoint; it rejects active runs/checkpoints, changed source config/version, owner/epoch or raw checkpoint, then rolls back. The returned snapshot hash must be separately bound into execute. Inspect does not issue provider HTTP or durable writes.
- Execute CAS-advances source owner/epoch only after the approved hash matches. It fsyncs a fixed public diagnostic contract **before** HTTP; transport permits one site-16 merged list at the saved `offsetId=20/pageIndex=2`, at most 20 details whose IDs came from that list, manual redirect and strict TLS. No refresh, site 2/9, homepage or other endpoint is admitted. The per-item diagnostic is allowlisted and hashed before normalization; a non-enriched item still fails closed.
- After observed detail rejection before page transaction, it rechecks the same live owner/epoch, exact unchanged checkpoint and no active run, then emits authenticated `forward_page_precommit_failed`. That receipt can support another **separately approved** forward attempt. Owner/page COMMIT unknown or unverified post-commit journal cannot be retried on this path.

## Decision and boundaries

**Candidate GO** for project-manager serial `inspect-forward-resume`. If the real inspect returns `LAST_NIGHT_FORWARD_INSPECT_READY` with the expected account/checkpoint `offset20/pageIndex2`, and a new approved execute plan binds its exact snapshot hash and a new owner/output, **conditional GO for one execution** to diagnose the already failed page and, only if all details are enriched, commit that one page. The manager must return the report, protected/public journal hashes, fixed diagnostic, and exact checkpoint/run/source-lease postcheck for independent QA. Any mismatch, timeout, detail rejection or unknown COMMIT remains NO_GO and stops further HTTP.

Residual: production CLI encryption/env/DB/provider E2E and a real successful third page have not been observed; this one bounded execution is their controlled validation, not a prior PASS claim. The initial old-session causal proof relies on the exact manager postcheck plus live owner/checkpoint locks; subsequent `forward_page_precommit_failed` receipts carry the stronger chained binding. Remaining feeds/comments/replies, AI exact completion and unique daily 02:00 owner are out of scope. Full-chain release remains **NO_GO**.
