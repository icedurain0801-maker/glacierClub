# Last Night AtcaLQ page-2 detail gate live QA

Status: CONTROLLED_DIAGNOSTIC_PASS / PAGE_COMMIT_NO_GO / FULL_CHAIN_NO_GO
Date: 2026-10-09 (Asia/Shanghai)
Scope: independent local verification of manager-executed one-page result, AES-GCM journals, allowlisted public diagnostic and manager read-only DB postcheck. QA made no live DB/provider query, retry or mutation.

## Evidence chain

- Approved AtcaLQ execute plan binds inspect snapshot hash `4baf722c4b7c1d253b899b4f04ddd3944433a9436f9c8248e3916ef348130517`, frozen CLI SHA256 `9470f844722cfb751494babd7e07c6286415f87a638a3277dbaaed0aeb0e1e4e`, and the prior authenticated base/session/postcheck SHA values. Result `execute-forward-resume-result.json` SHA256 `739665f8e782d9ca840a394591d20b63bb6c22702de47d11a5e558f3907de93f` reports `NO_GO/LAST_NIGHT_DETAIL_EVIDENCE_REQUIRED`.
- Public diagnostic `public/85a42830-a442-4ef1-9bd0-bca21f7e1a8e-0002.json` SHA256 `44a6d1827ac9824437c1f08e96b13797ae077e9138a0c8a78a70e8656b8add80`: `offset20/pageIndex2`, 20 rows, 14 accepted `detail_enriched`, **6 rejected `summary_fallback/DETAIL_RESPONSE_INVALID`**. All 20 are `post` with an external ID. Each item exposes only `idHash,contentType,integrityStatus,integrityCode,hasExternalId,accepted`; no body, URL, raw provider payload or token was present. The six affected hashes are in this artifact, not expanded to raw IDs by QA.
- Protected journal sequence `protected/85a42830-a442-4ef1-9bd0-bca21f7e1a8e-0001..0004.encrypted.json` authenticated with the configured AES-GCM AAD. Phases are `forward_resume_prepared`, `forward_resume_commit_prepared`, `forward_resume_committed`, then `forward_page_precommit_failed`. Final file SHA256 `e51b7ee5d45f68d8636f025c2a449230a7dcc8d771aac76c34f9cf399b74b2ae` binds source/account/checkpoint and owner transition epoch 1537→1538 (`lastnight-independent:85c50a17-6d25-4110-8d87-aaaaf34d878c`); it records `httpExecuted=true`, `pageCommitAttempted=false`, `checkpointUnchanged=true`, error `LAST_NIGHT_DETAIL_EVIDENCE_REQUIRED`.
- Manager-produced read-only `page2-detail-failure-postcheck.json` SHA256 `6d0a80a9f69cf05a11084fcd20de61d2d817d1d56ea90198bc5a5fce3719633c` independently matches the result/public SHA values and terminal journal identity. It reports checkpoint exact-text equality to journal, still `idle`, `itemsFetched=16`, `offset20/pageIndex2`, no error/lease; source owner/epoch equal terminal token 1538; no new page-2 run. This is a manager DB snapshot, not a second QA query.

## Defect returned to development

The real page-2 list/authorized detail requests occurred, but six detail results failed the connector's validity contract. `DETAIL_RESPONSE_INVALID` can be emitted for malformed/missing detail data, mismatched detail ID, or missing usable text content; the allowlisted diagnostic does **not** identify which inner predicate failed for each hash. The developer must locate the six exact cases through a newly scoped, non-sensitive diagnostic or provider-contract evidence, preserving the `detail_enriched` requirement. Do not mark the 14 good rows stored: this page is atomic and `pageCommitAttempted=false`.

The final authenticated `forward_page_precommit_failed` journal is a possible input to the separately approved forward-resume contract; it is not permission to immediately re-request the page. Any next attempt requires new snapshot/owner/cursor fencing and manager serial authorization. The prior site-2 and site-16 page-1 bounded PASS remain intact; page 2, remaining feeds/comments/AI and full-chain release remain **NO_GO**.
