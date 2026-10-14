# Six-community selector candidate: independent QA result

Status: PASS_OBSERVED_UI_CANDIDATE / LIVE_EMPTY_PERMISSION_UNVERIFIED / NOT_RELEASE_GO
Candidate: `.Codex/docs/2026-10/2026-10-09/v039_community_selector_manifest.json`
Instance: `http://127.0.0.1:3000/admin/PublicOpinion/index.html` (read-only QA static proxy to existing `127.0.0.1:4320`; no 3001 occupation)

## Independent raw results

- Before and after test, SHA-256 recomputation matched all 9/9 manifest entries; shared `scope.js` SHA-256 `0193f49d1a74b5166ffb12d89512567b0635d0e8455ec798931096f337814fb1`. No candidate drift.
- `node --test .tests/2026-10/2026-10-09/community-selector-isolated.test.js`: 4 tests, 4 passed, 0 failed, exit 0. It exercised hidden URL/session/control fallback, domestic/overseas ordering, permissions object retention, epoch cancellation, popstate normalization, disabled/hidden-only empty scope, read blocking and six v148 references. This is QA's own execution, separate from developer's 4/4 report.
- `git diff --check` restricted to the 7 front-end files: exit 0; Git reported only future LF-to-CRLF conversion warnings. All 7 actual resources returned HTTP 200 from port 3000 and had the exact manifest SHA-256, not merely matching workspace files.
- Existing API `127.0.0.1:4320/api/public-opinion/communities` was read-only queried for both regions. Domestic IDs: 超能世界国服版 `00000000-0000-0000-0000-000000000101`, 圣魂纷争 `8b1f0000000000000000000000000001`, 我要当老祖 `8b1f0000000000000000000000000022`. Overseas IDs: X-Clash `8b1f0000000000000000000000100016`, Last Light `00000000-0000-0000-0000-000000000102`, Hero Clash `8b1f0000000000000000000000100002`. Each returned the expected region and `enabled` status.
- In the in-app browser, all 6 pages (`index`, `content`, `alerts`, `sources`, `collection-runs`, `keywords`) were opened once per region with an invalid/hidden URL community ID. All 12 completed loads displayed exactly the three requested options in order, selected the allowed real default ID and replaced the URL's hidden ID. Every page loaded `scope.js?v=148`. The actual keywords-page region switch and its sidebar link to content preserved the correct selected scope. Visual inspection of the keywords page found the selector legible and unobstructed.
- The 3000 QA proxy recorded 38 API GETs during the browser sequence, of which 24 carried `communityId`; all 24 had the expected real ID for their region (15 domestic, 9 overseas), with 0 hidden or cross-region scoped IDs. The remaining 14 were community-list reads without a community ID. The logger retained only path, region and community ID, not credentials or response bodies.

## Boundary

Live API currently returned all six allowed communities as enabled, so disabled/unauthorized/empty states and a deliberately delayed stale response were validated only in the isolated fixture, not by modifying live DB or permissions. No screenshot artifact was written; the actual page was visually inspected in the browser. The candidate manifest contains front-end, test and documentation files only; this does not assert that unrelated pre-existing dirty-worktree changes are part of this candidate. QA did not trigger collection, edit DB/config, restart shared services or use 3001. This UI candidate result is not a release GO and does not close overseas collector QA.
