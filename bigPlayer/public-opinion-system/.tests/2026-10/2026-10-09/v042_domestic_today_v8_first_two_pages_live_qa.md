# Domestic BigPlayer v8 first two live pages independent QA

Status: PASS_FIRST_TWO_PAGES_DB_AND_EXTERNAL_API / WHOLE_DAY_PENDING
Date: 2026-10-09 (Asia/Shanghai)
Scope: domestic source `5c21f78d-5f67-4467-963d-dcdeb5e26cab`, account `70c393cf-9600-11f1-b3d2-d85ed3ae61b0`, community 101, board 2 merged home posts. Captured window `[2026-10-08T16:00:00.000Z, 2026-10-09T04:31:29.177Z)`.

## Independent read-only evidence

- Page-1 execution report `first-segment-v8-execution.json`: `PARTIAL_TODAY`, one page, 16 inserted and 16 AI queued; it listed 13 of the originally captured 16 IDs. Three newer in-window posts entered the moving first page.
- Page-2 report `first-segment-v8-page2-execution.json`: `PARTIAL_TODAY`, one page, 20 inserted and 20 AI queued, including the three earlier missing IDs `926875`, `926874`, `926869`. Its `missingExpectedIds` is page-local and must not be interpreted as a cumulative deficit.
- Independent script `v041_domestic_first_segment_readonly_qa.js` used only parameterized `SELECT` statements. It verified all 36 distinct external IDs against source/account/community ownership, in-window UTC publication time (including exact captured timestamps for the original 16), nondeleted state, `detail_enriched`, provider-detail ID and SHA256, stored fingerprint, nonempty analyzable text, and matching light AI job/fingerprint. Result: `PASS_FIRST_SEGMENT_DB`, 36/36 rows and 36/36 jobs, no issues, cumulative missing captured IDs `[]`.
- At the read snapshot, the 36 AI jobs were 16 completed and 20 pending. This is queue/persistence acceptance, not AI completion acceptance. The recovery checkpoint was idle, had a persisted cursor, no lease, and no account advisory lock holder. `items_fetched` had already advanced to 116 because further manager-controlled pages ran concurrently; it must not be compared to the first two pages' 36.
- Two read-only GETs to `https://lfy3001.dev.q1op.com/api/public-opinion/contents` for the domestic source and Shanghai-day window returned HTTP 200, total 116, 116 distinct observed IDs, including all first-two-page 36. Local `http://127.0.0.1:3000` returned `ECONNREFUSED`; no service was started and local page rendering was not accepted.

## Remaining gate

These checks prove the original 16 missing IDs are now persisted and externally queryable, and the first two pages' 36 records have matching full-detail and AI-queue evidence. They do not prove all 116 later rows, full-day completeness, other feeds, comments, replies, final AI completion, or the local 3000 UI. Further page execution must independently recheck the current account lock and checkpoint lease immediately before acting. No QA production write, POST, service restart or overseas collection was performed.
