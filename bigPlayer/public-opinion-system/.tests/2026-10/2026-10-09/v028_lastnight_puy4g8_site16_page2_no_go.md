# Last Night puy4g8 site-16 merged page 2 failure QA

Status: PAGE2_NO_GO / RECOVERY_ENTRY_BLOCKED / FULL_CHAIN_NO_GO
Date: 2026-10-09 (Asia/Shanghai)
Scope: offline examination of manager-produced execution artifacts. QA made no DB/provider request, retry, or mutation. Previous site-2 and site-16 page-1 PASS decisions remain valid for their bounded scopes.

## Evidence

- Approved `resume-site16-page2.controlled-approved.json` binds the previous page-1 committed journal SHA256 `54e8bf24b853b94917339b691e1a1dfe1da16980aa24992cb6e51abe37f67a5b`, the same 544-file frozen inventory and CLI SHA256 `993d8f88a87ba5e9eeec8a072e96b504b422433500fcc4b938de3dbd8930f5ff`, with a new owner `lastnight-independent:0c4cc8e6-5d57-48f4-b354-ed1f784a6f4e`.
- `resume-site16-page2-result.json` SHA256 `64d547064d21b7850e9d10be82a85c0a58a01779ce3e20ef6f5d9d48a7540d66` reports `NO_GO/LAST_NIGHT_DETAIL_EVIDENCE_REQUIRED`; manager reports CLI exit 1. This is a content-integrity gate, **not** evidence of an account/authentication failure.
- The only new encrypted evidence sequence is `686c6c12-3b40-4841-bf71-a4e5962a481a-0001..0003`. Authenticated decryption yields `resume_prepared`, `resume_commit_prepared`, `resume_committed`, moving the source token from owner/epoch `6c53.../1536` to `0c4.../1537`. No `recovery_page_prepared` or `recovery_page_committed` journal for page 2 was produced. No page-2 checkpoint advancement or content writes are claimed without the manager's read-only DB postcheck.
- Manager-produced read-only `site16-page2-failure-postcheck.json` SHA256 `0431706d5b46c526feacb301f57ea49c85167b40f2cdda98d851ea3c9861de8f` reports the checkpoint still `idle` at `offsetId=20/pageIndex=2`, `itemsFetched=16`, null error/lease; no new page-2 run; source owner `lastnight-independent:0c4cc8e6-5d57-48f4-b354-ed1f784a6f4e`, epoch 1537, lease until UTC `03:53:37.927`. This locally verified artifact matches the manager's stated no-page-transaction postcheck, though QA did not query DB itself.

## Defect and gate

`recoverFirstSite16Page` fetches the page, then maps returned items through `normalizeIndependentPost` **before** `START TRANSACTION` for page storage. `LAST_NIGHT_DETAIL_EVIDENCE_REQUIRED` can arise from unsupported/missing `contentType`, missing `externalId`, or a raw `_contentIntegrity.status` other than `detail_enriched`; the current result does not distinguish these. A controlled, redacted diagnostic is needed. Do not weaken the detail requirement, accept summary fallback, or label the failure as credentials.

Separately, `resumeRecoverySession` durably CAS-advanced the source owner/epoch before page normalization failed. Its current input contract accepts only `recovery_page_committed` evidence; reusing the page-1 journal still names epoch 1536 and will fail the owner/epoch comparison against epoch 1537. Therefore the existing approved resume contract has **no safe direct retry path** after this failure. A new, independently QA-reviewed minimal recovery candidate must authenticate the committed resume journal, verify current DB checkpoint/source state and preserve the offset-20 cursor before any retry. No manual lease reset, old-journal replay, or unapproved plan execution.

## Closed read-only postcheck

The manager's redacted snapshot closes checkpoint/run/source-lease identity for this failed attempt: no page-2 run or cursor advance, but a committed source-owner handoff. It does not identify which incoming item failed the detail gate. Site-16 remaining pages/feeds, comments, AI exact completion, daily owner and full-chain release remain **NO_GO**.
