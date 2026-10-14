# Domestic post-cutover read/UI independent QA

Status: PASS_POST_CUTOVER_DOMESTIC_READ_UI
Date: 2026-10-09 (Asia/Shanghai)
Scope: read-only cutover acceptance. QA did not switch services, modify Worker/tasks, or use sync/authorization/delete actions. Overseas Last Night is not covered by this PASS.

## Asset and real page

No-cache GET of `http://127.0.0.1:3001/admin/PublicOpinion/assets/sources.js`: HTTP 200, SHA256 `E7A50696141B1455AA44FEF4BD2D19CFE7CAD29BD00CB2A9421657380976AF88`, 124667 bytes. The actual `sources.html` page for domestic community `00000000-0000-0000-0000-000000000101` showed one BigPlayer account source, authorized, with both scopes failed and the existing provider pagination budget error. No reload or write action was used after the page loaded.

| Scope | Page written | Page pending | API 8-row summary result | Status |
|---|---:|---:|---|---|
| Posts | 262391 | 298 | `177388+18790+0+66213=262391`; pending `2+296=298` | failed |
| Comments | 244757 | 1072 | `244756+1+0+0=244757`; pending `1070+2=1072` | failed |

The first posts-scope error used by the page contains `provider_pagination_budget_exhausted`; it is an existing Worker/provider outcome, not evidence that this read/UI cutover caused a collection failure. The page displayed the same error code. The source API returned eight aggregate checkpoint rows for `posts` and `comments`; the page's values matched those rows.

## Read field contract

Real 4320 read-only GETs were summarized without storing response bodies or credentials:

- Sync-run list: 20 items, `meta.total=4105`; item fields include `id`, `status`, `run_role`, `source_id`, `fetched_count`, `error_message`, and `parentRunId`.
- Detail ID `68878a64-8601-44ce-91f9-5df034e4fa7e` is present in that list; ID, source, role and status agree with the listed row.
- Latest run belongs to source `5c21f78d-5f67-4467-963d-dcdeb5e26cab`, is present in the list, and role/status agree. In detail and latest, `parent_run_id` and `parentRunId` are consistent.
- The earlier independent protected five-GET report is `v009_domestic_real_five_get_independent_qa.md`; it reported all five HTTP 200 and unchanged protected baselines. The project manager separately reported all five post-switch HTTP 200.

This PASS is confined to the domestic candidate's read API, current static asset and observed sources UI/field contract. A roughly 705px default browser viewport showed a sidebar overlapping some source content, while the source values remained accessible; cause and prior existence were not established in this cutover QA, so record as a separate responsive-layout observation, not a regression attribution. Overseas authorization, real capture, persistence and async AI remain `NO_GO` pending separate acceptance.
