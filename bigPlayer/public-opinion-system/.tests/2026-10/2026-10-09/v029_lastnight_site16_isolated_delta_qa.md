# Last Night site-16 isolated delta QA

Status: OFFLINE_ISOLATED_TEST_PASS / PRODUCTION_RECOVERY_NO_GO
Date: 2026-10-09 (Asia/Shanghai)
Scope: read-only review of the developer's unfrozen offline delta. No DB/provider request or business-code edit. This does not modify or inherit puy4g8's 544-file freeze.

## Verification

- `node scripts/lastnight-site16-isolated.js --isolated`: 12/12 PASS, exit 0, reports `productionExecuted=false`, `fullChainComplete=false`.
- `node --test` on `lastNightSite16TaskFlow`, `lastNightTaskCheckpointStore`, `lastNightSite16IsolatedExecutor`, and `lastNightRecoveryFailureContract`: 14/14 PASS, exit 0 (the above 12 plus two failure-contract tests).
- `node scripts/lastnight-site16-isolated.js --production`: exit 1, `PRODUCTION_EXECUTION_DISABLED`. The entrypoint imports only the isolated tests; the executor requires an in-process registered fixture and `mode='isolated-test'` before touching store/loader. No production DB/HTTP adapter is attached.

## Review result

The task store has bounded page/cursor persistence, source and run lease fences, legacy Repository pinned-transaction adaptation, reuse-without-overwrite, child-checkpoint insertion in the page transaction, and distinct COMMIT-unknown reporting. Offline tests cover fresh post/AI enqueue, historical reuse, foreign membership rejection, root/parent/depth checks and cursor stall. These are **fake-connection contracts**, not a live database proof or permission to execute all 23 feeds/comments/replies.

`diagnoseDetailPage` returns only hashed external ID and allowlisted type/integrity/code; it can distinguish unsupported type, missing ID and non-enriched detail without emitting body or provider payload. It has not been wired to a controlled live page-2 diagnostic. Therefore the actual page-2 `LAST_NIGHT_DETAIL_EVIDENCE_REQUIRED` trigger remains unknown.

`bindCommittedSession` is explicitly non-admitting (`productionAdmitted=false`) and accepts authenticated journal objects supplied by its caller. It checks SHA inputs, source/account/parent and epoch+1, but does not itself authenticate/decrypt files, lock and compare the live checkpoint/source, or prove the causal link from the base journal's exact owner to the resume journal's `beforeToken`. The current `resume_committed` journal omits `beforeToken`; production admission needs a separate authenticated sequence/owner proof and DB CAS. The existing puy4g8 CLI still accepts only `recovery_page_committed` input, so the post-failure epoch-1537 state has **no approved live recovery entry**.

Open before any new candidate GO: exact nested-reply topology and reply branch, fresh-write identity, reused-count semantics, authenticated base+resume journal CLI and locked checkpoint/owner forward recovery, bounded redacted detail diagnostics, new freeze/inventory, and independent live postcheck. Prior bounded site-2/page-1 PASS remains intact; page-2 and full chain remain **NO_GO**.
