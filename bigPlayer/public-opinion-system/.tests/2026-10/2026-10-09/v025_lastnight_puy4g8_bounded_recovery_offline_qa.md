# Last Night puy4g8 bounded recovery independent QA

Status: CONDITIONAL_STAGE_GO / LIVE_FULL_CHAIN_NO_GO
Date: 2026-10-09 (Asia/Shanghai)
Scope: offline review only. No live DB/provider request, approved plan execution, task mutation, or domestic baseline experiment.

## Frozen candidate and verification

- Candidate: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009/lastnight-runtime-puy4g8`, declared `QA_PENDING_NOT_DEPLOYED`.
- Manifest SHA256 `caf84e3b908096270a2741e8e04991e917b629c41ac1e728982fc2c84b49ed0c`; current inventory independently verifies **544/544**. CLI SHA256 `993d8f88a87ba5e9eeec8a072e96b504b422433500fcc4b938de3dbd8930f5ff` matches the frozen candidate. Any closure-byte change voids this verdict.
- Independently reran the five affected test files: **15/15 PASS, exit 0**. These use fake DB/connector; the Repository SQL and AI queue test invokes actual Repository methods against a recorded fake connection, not live MySQL.

## Stage decisions

| Stage | Offline QA decision | Required live gate / limitation |
|---|---|---|
| `inspect-handoff` | **Candidate GO** for project-manager serial read-only execution. | Must return current parent/children/source/schedule identity and snapshot hash, with zero mutation. A changed run, active owner, lease, registry or config is NO_GO; old 03:19 evidence is not a substitute. |
| `apply-handoff` | **NO_GO**. | CLI explicitly rejects standalone handoff; no five-minute idle lease handoff. |
| `recover-site2-page` | **Conditional candidate GO** for one authorized language-2 page only, after a fresh `inspect-handoff`, approved exact input SHA and matching snapshot hash. | Continue checkpoint `0205567a-70c3-4ca2-a416-456ef2f09a66` from offset 50; do not reset to zero or infer three missing rows. Same connection/account lock, source epoch fencing, 120-second deadline and pre/post-commit protected journals must be observed. Any commit-unknown or journal-failure result is immediate NO_GO, with no blind retry. |
| `resume-recovery-page` | **Conditional candidate GO only after** the previous page has a verified `recovery_page_committed` journal and independent post-commit DB comparison. | New approved plan per page; revalidate saved cursor, source owner/epoch, account lock and no competing run. It is not permission to run a whole feed loop. |
| `recover-site16-first-page` / combined page stage | **Not selected for first live step**. | Site 16 first merged page is still separate; combined 70-detail-request stage has no live latency/commit proof. Site 9 completed scope must not be re-fetched. |

## Code evidence and residual risk

- Checkpoint windows are `varchar(32)` in the live schema contract and use the same ISO strings as the recovery input; run windows are `datetime(3)` and are checked separately. The precise plan selects the current seven-day checkpoint, excludes September rows and requires cursor v2 with offset 50.
- The write path calls the real Repository page-upsert method on a pinned connection, adapting only legacy `board_id`/`board_name` INSERT columns. Existing type-only rows are selected and associated without body/raw/fingerprint overwrite. New rows require detail-enriched evidence; explicit foreign board markers and conflicting membership metadata fail closed. Request board `100017` remains distinct from a provider board assertion, which may be absent.
- Run/content/membership/checkpoint/AI enqueue changes share the page transaction. Source lease is checked before and after; a competing active run or lost checkpoint lease aborts. COMMIT unknown is distinguished from committed-but-journal-failed and cannot be treated as a normal retry. The 300-second lease is a temporary recovery fence, **not** a unique daily 02:00 owner.
- No current live post-commit evidence is available for this candidate. Prior exact-association evidence proves 272 unique contents, 164 memberships and only 20 completed matching light analyses at its observation time; it cannot establish the later state or complete AI processing. Language 16 remaining 22 feeds, comments/replies, historical detail repair, full AI completion and legacy daily slot remain unverified. `fullChainComplete=false`; release remains **NO_GO**.

## Next evidence requested from project manager

Serially execute `inspect-handoff` only after filling its explicit approval fields. If its live result matches, present the result and exact `recover-site2-page` approved plan for a separate GO decision. After any page, provide protected journal hash, before/after checkpoint and run rows, exact new/reused content IDs with fingerprints, membership and AI job associations, source lease epoch/owner, and domestic frozen-baseline comparison. Do not execute any `*.unapproved.json` template.
