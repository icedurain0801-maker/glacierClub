# Last Night lYJYzP six-detail shape candidate QA

Status: SHAPE_INSPECT_CANDIDATE_GO / SHAPE_EXECUTE_CONDITIONAL_GO / PAGE2_NO_GO
Date: 2026-10-09 (Asia/Shanghai)
Scope: offline independent review only. `ctj260` and `b2r1Dj` intermediate packages are withdrawn and must not execute. No live DB/provider request, approved-plan execution or business-code edit by QA.

## Candidate and tests

- Candidate `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/lastnight-forward-lYJYzP`, manifest SHA256 `0c81a45ae55d138bcba372a3641248a61e458eb61edabce2fd1fd4b7f4e0997f`, CLI SHA256 `ba13fc6b5ab102107c8ed841f3b42ac8b467112f0d1e9229618ff56b66b9efb6`. `verifyForward(manifest)` independently passed **base 544/544 + forward 9/9**.
- `node --test worker/test/lastNightForwardResume.test.js worker/test/lastNightRecoveryFailureContract.test.js worker/test/lastNightForwardSuccess.test.js worker/test/lastNightTargetLockAdapter.test.js server/test/lastNightDetailShapeConnector.test.js`: **14/14 PASS, exit 0**. `node scripts/lastnight-forward-resume.js --approved-plan <unapproved shape inspect template>`: exit 1, `LAST_NIGHT_APPROVED_PLAN_REQUIRED` before DB/HTTP.
- The prepared inspect plan binds the original site-16 page-1 journal SHA256 `54e8bf24b853b94917339b691e1a1dfe1da16980aa24992cb6e51abe37f67a5b`, authenticated AtcaLQ `forward_page_precommit_failed` terminal SHA256 `e51b7ee5d45f68d8636f025c2a449230a7dcc8d771aac76c34f9cf399b74b2ae`, and public 20-item diagnostic SHA256 `44a6d1827ac9824437c1f08e96b13797ae077e9138a0c8a78a70e8656b8add80`; all three files independently rehashed to match. The diagnostic selects exactly six `summary_fallback/DETAIL_RESPONSE_INVALID` hashes.

## Read-only execution contract

- `inspect-detail-shape` binds the authenticated journals and diagnostic into the snapshot, takes account GET_LOCK, verifies source/account/three-site config, owner epoch 1538, active tasks and exact saved checkpoint `offset20/pageIndex2`, then rolls back without HTTP or durable DB mutation.
- `execute-detail-shape` must match a fresh inspect hash. Its `diagnosticOnly` branch rolls back **before** HTTP while retaining the account connection/GET_LOCK. It fsyncs the fixed public shape contract, requests exactly one original merged-list page, and the specialized connector selects only the six hashes; duplicate or non-matching selection fails closed. Each selected detail ID may be requested once. It cannot enter `recoverFirstSite16Page`, source-owner CAS, page INSERT/UPDATE or COMMIT. Its success status is `LAST_NIGHT_DETAIL_SHAPE_RECORDED`, with `ownerChanged=false`, `pageCommitted=false`, `fullChainComplete=false`.
- Shape output is limited to type/presence/equality flags, fixed allowlisted field-name/type maps, bounded block shapes, rejection class and shape hash. It does not write body, arbitrary provider keys/values, URL or token. A mismatched upstream detail ID is observed, **not** excluded as a possible cause. The common HTTP guard admits one list and at most 20 detail requests; the specialized six-hash connector narrows actual shape mode to six. The new test covers no UPDATE/INSERT/COMMIT, but the real one-list/six-detail request count and data shape remain a live QA postcheck.

## Decision

**Candidate GO** for manager serial `inspect-detail-shape` using the prepared lYJYzP approved plan. Only after it returns the current snapshot hash with unchanged owner/cursor may a new approved `execute-detail-shape` bind that hash for one diagnostic run. Return result, public shape files/hashes and read-only owner/checkpoint/run postcheck. Stop on scope drift, an unexpected HTTP count, non-allowlisted output or timeout; do not run intermediate packages or replay the collection page.

This is read-only structural diagnosis, not a page-2 recovery. The six exact inner invalidity causes, page-2 commit, remaining feeds/comments/AI and daily owner are pending. Full-chain release remains **NO_GO**.
