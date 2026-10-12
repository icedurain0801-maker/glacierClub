# Public Opinion six-page community selector: independent QA

Status: PASS_OBSERVED_UI_CANDIDATE / LIVE_EMPTY_PERMISSION_UNVERIFIED
Owner: 测试负责人
Manager handoff: `.Codex/docs/2026-10/2026-10-09/v034_global_community_selector_manager_progress.md`
Scope: UI-selectable communities only. Do not delete/disable data, expand permissions, or change collection, Worker, scheduling or AI.

## Full acceptance queue

| Gate | Independent test and evidence | State |
|---|---|---|
| Candidate lock | Receive six HTML paths plus `bigPlayer/admin/PublicOpinion/assets/scope.js` manifest/SHA-256 and developer raw results; independently hash the same files before/after testing. Developer self-test is not QA PASS. | PASS: 9/9 pre/post SHA-256 |
| True identity mapping | Read-only compare the six allowed labels to actual community `id`/`externalId`, region, status and permissions returned by the existing API/DB. No fabricated labels or duplicate IDs. | PASS: six real API identities, all currently enabled; live permission variance unverified |
| Domestic menu | On each page, region domestic shows only 超能世界国服版、圣魂纷争、我要当老祖, in that exact order; options use real IDs and retain disabled/unavailable semantics. | PASS: 6/6 browser pages; disabled isolated only |
| Overseas menu | On each page, region overseas shows only X-clash、Last Light、Hero Clash, in that order; real-name capitalization may follow the stored record, but identity must match. | PASS: 6/6 browser pages |
| Six-page scope | Test `index.html` overview, `content.html` content, `alerts.html` alerts, `sources.html` accounts/sources, `collection-runs.html` runs and `keywords.html` keywords. Cross-page navigation and region/community changes keep the same allowed selection and actual request scope. | PASS: 12 page-region loads; actual region switch and cross-page link |
| Old URL/session fallback | Open each page with a hidden/removed community ID in URL and session, including a legacy ID from the same region and a cross-region ID. The control, URL/session, emitted selected state and subsequent API query must all use an allowed real ID or remain safely unavailable; no hidden ID may leak into a request. | PASS URL and 24/24 scoped requests; session fallback isolated test only |
| History/async race | Browser back/forward, fast region switching and delayed prior requests cannot restore a hidden option, wrong-region result or stale content. Check request abort/epoch behavior and URL normalization after `popstate`. | PASS isolated 4/4 includes epoch and popstate; browser race not forced |
| Empty/disabled/permission | Region with no permitted allowed community, failed community load, disabled item or missing permission preserves empty/unavailable/unauthorized state; filter must not broaden authority or invent an option. | PASS isolated fixtures; live disabled/permission/empty unverified |
| Cache and real page | All six HTML references use the same new `scope.js` cache version; verify loaded script version and visible selector plus actual read-only API requests on the 3000 no-login instance. Do not use 3001. | PASS: v148 all six, served 7/7 hashes, 24 scoped requests correct |
| Scope isolation | Compare candidate manifest and read-only runtime baseline: no DB migration/config write, source/account permission change, Worker/scheduler/algorithm or collection trigger in this UI-only small task. | Candidate manifest only front-end/test/docs; QA made no DB/Worker writes or collection trigger |
| Final disposition | Preserve per-page screenshots/network evidence and raw command/browser results. Any false ID, stale hidden-ID query, cross-page divergence, permission regression or missing page is NO_GO and returned to development owner. | PASS_OBSERVED_UI_CANDIDATE; live negative states remain unverified; see v061 report |

## Page matrix

| Page | Domestic 3 | Overseas 3 | Old URL/session | Region/cross-page | Empty/permission | Epoch/network | Cache version |
|---|---|---|---|---|---|---|---|
| `index.html` | Pass | Pass | Pass URL | Shared path | Isolated | Isolated | v148 |
| `content.html` | Pass | Pass | Pass URL | Shared path | Isolated | Isolated | v148 |
| `alerts.html` | Pass | Pass | Pass URL | Shared path | Isolated | Isolated | v148 |
| `sources.html` | Pass | Pass | Pass URL | Shared path | Isolated | Isolated | v148 |
| `collection-runs.html` | Pass | Pass | Pass URL | Shared path | Isolated | Isolated | v148 |
| `keywords.html` | Pass | Pass | Pass URL | Region switch | Isolated | Isolated | v148 |

Observed UI results are specific to the locked v039 candidate served on the 3000 no-login QA instance. Overseas BigPlayer collector QA remains a separate open workstream.
