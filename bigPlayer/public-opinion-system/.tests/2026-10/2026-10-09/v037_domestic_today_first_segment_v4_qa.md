# Domestic BigPlayer 2026-10-09 first-segment v4 independent QA

Status: SUPERSEDED_BY_V5 / DO_NOT_EXECUTE_V4
Date: 2026-10-09 (Asia/Shanghai)
Scope: source `5c21f78d-5f67-4467-963d-dcdeb5e26cab`, account `70c393cf-9600-11f1-b3d2-d85ed3ae61b0`, community 101, board 2, merged home posts, captured window `[2026-10-08T16:00:00.000Z, 2026-10-09T04:31:29.177Z)`. No QA production HTTP/DB write, service restart, overseas execution, or task change.

Superseded before execution by `v038_domestic_today_first_segment_v5_qa.md`. The conditional gate below is historical and does not authorize v4.

## Independent evidence

- Manager-controlled first-page read-only evidence captured 2026-10-09T04:31:29.177Z: 16 in-window external IDs absent from the target source DB; four pinned older rows demonstrate that the merged page is not time-sorted. Provider `hasMore` and `total` were null. This evidence proves a miss at capture time, not that those 16 IDs remain on page 1 at execution time.
- `node --test worker/test/domesticTodayRecovery.test.js`: 10 tests, 10 pass, 0 fail. The suite includes an actual frozen release Connector fixture, SQL transaction fixture, pinned-row detail filtering, complete media/opaque raw preservation, no-text AI exclusion, request-cursor replay after AI failure, and offset-ceiling noncompletion. These are isolated fixtures, not live DB results.
- Actual `inventory()` resolved 111 files; byte-for-byte mapping equals `plan-first-segment-v4.unapproved.json`. CLI SHA256 matches `ab3567dfa7b2d5b349ccd9c9854a956be5fa1ae762bd3aa376ca2c664e88b6e1`. Plan SHA256: `D2D494E8A947C93C1B035156036732585FF6B1864C44830C1695CCADDA875B74`. The plan remains `approved:false`, `maxPages:1`, and its output file does not exist.
- The unapproved plan passed to `--approved-plan` exited 1 with `DOMESTIC_APPROVED_PLAN_REQUIRED` before runtime DB/HTTP work. CLI, detail connector, and repository adapter syntax checks passed.
- Static path review: source/account/community/board/game, domestic region, authorization, site registry, exact capture end, account advisory lock, and live checkpoint lease are checked. The adapter uses the legacy content columns without a board column, READ COMMITTED, UTC collection timestamps, target-ID row locking, raw provider-detail digest, and readback of ID owner/fingerprint. A page retains the request cursor until AI enqueue succeeds; replay includes unchanged content. Complete rich detail with no title/body is stored with explicit raw text-availability flags and excluded from the AI queue, not analyzed as neutral.

## Execution gate

**Conditional GO** only for the project manager to approve and execute one page using the exact v4 frozen file map, unchanged source/window/`maxPages=1`, a new nonexisting output path, and the existing runtime identity/site/schema/lock preflight. No old v1/v2/v3 plan may run. Any inventory drift, scope mismatch, incomplete detail, lost lease, unknown commit, or unexpected side effect is **NO_GO** with no blind retry.

The result is not accepted from a CLI status alone. Manager-controlled read-only postcheck must reconcile all 16 captured external IDs against `po_contents` for this source/account/community, provider list and complete detail IDs/times, persisted published times, raw detail digest/media/body, deletion state, AI job or explicit no-text exclusion, and checkpoint cursor/status. Because the live merged feed may have gained newer posts after the capture, one page cannot guarantee all 16 captured IDs; if any remain absent, report partial progress and require a separately bounded continuation. `aiQueued` does not mean AI analysis completed.

Other feeds, comments, replies, whole-day completeness, today UI, overseas Last Night, and shared Worker baseline are **not** covered by this gate. No full release PASS is granted.
