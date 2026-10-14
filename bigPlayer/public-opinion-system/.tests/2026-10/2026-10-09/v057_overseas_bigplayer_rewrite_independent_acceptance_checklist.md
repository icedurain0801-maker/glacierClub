# Overseas BigPlayer API collector rewrite: independent QA checklist

Status: CANDIDATE16_FROZEN_OFFLINE_144_PASS / ISOLATED_REAL_SQL_11_PASS_PARTIAL / SOURCE_2_CONFIG_GAP / RUNTIME_NO_GO
Owner: 测试负责人
Requirement: `.Codex/docs/2026-10/2026-10-09/feature-overseas-bigplayer-api-collector-rewrite.md`
Manager handoff: `.Codex/docs/2026-10/2026-10-09/v033_overseas_bigplayer_rewrite_manager_progress.md`

## Scope and gates

All configured `regionCode=overseas`, `platform=bigplayer_h5` sources and every enabled site URL are in scope, not only Last Night or a fixed site count. Only the newly authorized overseas rewrite may be exercised. API origin is `https://club-en.q1.com` for list, activity, comment, board discovery and detail requests. Preserve site URL language/version/context, configured source/community/account/board identity and the existing 1h/6h/1d frequency (default 6h). Window/cursor rules follow the current domestic contract and use half-open `[start,end)`; domestic execution itself is not a test target.

No candidate manifest/hash or independently observed real run has been supplied at checklist creation. Developer self-tests, authorization checks, mocked requests, and a successful task enqueue are not evidence of real collection. No business-code/config/data change, shared-Worker restart, production scrape, manual run trigger, or 3001 service start is authorized to QA by this checklist. The development owner and project manager control deployment and the bounded real run; QA observes and verifies read-only evidence.

## Full acceptance queue

| Gate | Independent verification and required raw evidence | State |
|---|---|---|
| Candidate lock | Receive exact file manifest, SHA-256 hashes, base/runtime version, commands and raw developer results; rehash before and after QA. Record any drift as a new candidate. | v080 candidate 16 frozen snapshot: 658/658 pre/post matched, no reparse point; only handed-off `snapshot-raw.txt` extra. Node v22.22.0 matched. Earlier candidates remain separate historical results. |
| Config inventory | Read-only enumerate every eligible source and enabled site, account auth mode, positive `boardId`, frequency, language/version parameters, and current active executor; redact credentials. Compare configured count to executed-site count. | PARTIAL: TWO SOURCES INVENTORIED; SOURCE 2 BLOCKED; AUTH MODE/RUNTIME PENDING |
| Second-source config gate | For `8c690d6e-12ea-4ad3-b434-d941276c4906`, require its own-account real board discovery and a reviewed minimal board/site-registry repair plan with historical-reference and rollback analysis. Independently re-read after authorized apply; do not borrow source 1's `boardId` or treat active token as content permission. | BLOCKED_CONFIG; NO WRITE AUTHORIZED |
| Static/offline regression | Independently run candidate tests for validation, API origin, URL preservation, pagination/window/cursor, checkpoint, failure propagation, unique consumer, AI/translation queue; retain command, exit code and unedited output. | v080 candidate 16 exact 17-file snapshot command 144/144 PASS, exit 0; separate owned 13316 synthetic MariaDB script 11/11 main checks PASS with submatrices, exit 0. AI/translation completion and real provider remain unclosed. Prior snapshot counts do not transfer. |
| Existing consumer exclusion | Independently inspect every active Worker queue, manual marker/poll, legacy due, unified scheduler, expired-run recovery and claim path. New route must have one owner before real execution; an old dedicated process being absent is not proof. | BLOCKED: candidate 9 drain/poll/scheduler race passed offline, but existing Worker entry points and exclusive consumer cutover are not proven |
| Current DB schema and run contract | Read-only check actual required columns or a tested overseas-only legacy adapter, plus externally persisted immutable run contract and exact site/window/owner/epoch/cursor fencing. | BLOCKED: legacy columns absent; offline adapter/Journal tests pass, but trusted loader, run lifecycle and live consumer wiring are absent. |
| Two auth modes | For a bounded authorized source, verify password-first login and token-only path separately; password failure must not silently use stale token; rejected token/board permission must be explicit; no cross-source token. | PENDING_CONTROLLED_RUN |
| Multi-site API requests | For every enabled URL, match request host/path/board/section/cursor and site identity to per-site result. Include `post/list`, `post/activity/list`, `comment/{postId}` and domestic-equivalent auxiliary APIs on overseas origin. A failed site/page must not be reported as full success. | PENDING_CONTROLLED_RUN |
| Content fidelity | Match provider IDs, raw body/detail, post title, activity body, media, original publication UTC, source/community/board/site/language and backend row. Do not infer community from `boardId` or replace comment bodies with `commentCount`. | PENDING_CONTROLLED_RUN |
| Comment graph | Verify parent/root/depth for first-level and nested replies, an unchanged stored post with a new comment, and a window-new comment under an older post. Compare actual reply bodies and IDs to provider pages; report unexhausted pages as partial. | PENDING_CONTROLLED_RUN |
| Pagination/window | Check scheduled 02:00 and other-slot windows, manual admission/cursor, `[start,end)`, page exhaustion or proven time boundary, hard limit/stalled cursor, safe resume and per-site checkpoint. | PENDING_CONTROLLED_RUN |
| Idempotence/concurrency | Compare before/after row IDs, unique fingerprints, per-site checkpoints and AI/translation jobs for repeated same-window execution and manual/scheduled overlap; no duplicate content/version work or double claim. | PENDING_CONTROLLED_RUN |
| Async and backend | Match stored content fingerprint to completed light AI and overseas translation result; verify original and Chinese fields/status in backend read-only UI/API. Keep pending/retryable distinct from completed. | PENDING_CONTROLLED_RUN |
| Real manual run | Capture run ID, admission/claim timestamps, redacted request URL/status/page counts, provider sample IDs/raw hashes, write counts, row IDs, checkpoint, terminal status, AI/translation and backend visibility. Empty response, network failure and partial success must remain distinct. | PENDING_CONTROLLED_RUN |
| Next actual scheduled slot | Without QA triggering or changing the schedule, observe an actual due slot: automatic task creation, single claim, overseas requests, per-site writes/checkpoints, terminal outcome and async results. Static tests cannot close this gate. | PENDING_NEXT_SLOT |
| Shared baseline regression | Read-only/isolated compare domestic Worker and health schedule plus Discord, TapTap, Facebook config, origin, due/claim behavior and known baseline outputs; no experiment on these live sources or shared Worker restart. | PENDING_CANDIDATE |
| Final disposition | Reconcile configured sites versus executed sites, provider pages versus stored rows, content versus AI/translation and manual versus scheduled evidence. Any missing chain, regression, unauthorized scope or ten-minute real-run stall is NO_GO and returned to the development owner. | NO_GO_PENDING_EVIDENCE |

## Review result

### Independent configuration snapshot (2026-10-09 06:26:24.661 UTC)

`v058_overseas_source_config_readonly_qa.js` ran SELECT-only against the pinned local `public_opinion` database and returned `CONFIG_GAP`. The eligible overseas `bigplayer_h5` source set contains exactly the two IDs below. No credential secret or full config was emitted.

| Source | Configured board | Enabled configured sites | Enabled registry sites | Exact site ID + URL-hash alignment | Default account / token status | QA disposition |
|---|---|---:|---:|---:|---|---|
| `081a16d2-5545-4afd-9c65-e04777e4540b` | `100017` | 3 | 3 | 3/3 | enabled, `authorized`, active `api_token` present | Configuration aligned only; candidate and real collection pending |
| `8c690d6e-12ea-4ad3-b434-d941276c4906` | missing | 3 | 1 legacy | 0/3 (one URL hash matches, site ID differs) | enabled, `authorized`, active `api_token` present | `BOARD_ID_REQUIRED` and `SITE_REGISTRY_GAP`; source not accepted |

Both sources, games and communities are enabled and both frequencies are 21600 seconds. The second source's missing board and registry gap are **configuration facts**, not proof of account denial or proof that a particular board is accessible. Developer's 11/11 baseline is self-test evidence only; no candidate hash or independent test/real request has yet been accepted. Source 1 may proceed through later gates separately, but all-source acceptance remains NO_GO while source 2 is unresolved.

### 已覆盖

The confirmed requirement specifies all overseas BigPlayer configured sources/sites, two auth modes, API origin and paths, domestic window/cursor choice, post/activity/comment/reply fidelity, idempotence, asynchronous AI/translation, manual and scheduled execution, and isolation from domestic/other platforms.

### 待确认

No product-choice item is pending. Effective source/site inventory, currently deployed runtime, unique overseas consumer, bounded real-run authorization and next actual due slot are runtime facts to establish from candidate and read-only evidence. If a required edge case is absent in live data, record it as unverified rather than synthesize production content.

### 缺失/风险

Authorization success alone cannot prove accessible board/content pages. Existing unchanged or older parent posts may hide new comments. An upstream page cap, stalled cursor, failed site or unfinished AI/translation can create a false full-success signal. Historical Last Night failures are references, not proof of current failure. The shared domestic/Discord/TapTap/Facebook runtime must not be disturbed for this QA.

### 建议补充的验收用例

1. Enabled overseas sites with different language/version parameters -> complete a bounded run -> every site retains its parameters and has distinct request/write/checkpoint evidence.
2. Stored unchanged post or older post receives a window-new reply -> traverse comment pages -> new body and parent chain are stored once even if the parent post is not newly inserted.
3. One site fails after another succeeds -> inspect child and parent outcomes -> successful site remains accounted for, failed stage is explicit, parent is not full success.
4. Same content/version appears in repeated or overlapping run -> reconcile content and job IDs -> no duplicate row, AI job or translation job.
5. Actual next frequency slot becomes due -> observe without manual trigger -> scheduler creates and claims one task, requests overseas API, persists rows and reaches a truthful terminal state.
