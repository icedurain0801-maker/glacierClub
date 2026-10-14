# Domestic today comment 926761 live independent QA

Status: PASS_ONE_POST_ONE_PAGE / CONDITIONAL_GO_EXPLICIT_SAME_CONTRACT_TARGETS / WHOLE_DAY_PENDING

Scope: domestic BigPlayer source `5c21f78d-5f67-4467-963d-dcdeb5e26cab`, account `70c393cf-9600-11f1-b3d2-d85ed3ae61b0`, community 101, board 2, post `926761`, captured window `[2026-10-08T16:00:00.000Z, 2026-10-09T04:31:29.177Z)`. No QA production write, provider request, task modification or 3001 service start.

## Evidence

- Frozen `graph-v3-comments-926761-page1.controlled-approved.json` specifies `mode=comments`, `postId=926761`, `maxPages=1`, new output and exact captured window. Independent `inventory()` matched all 115 file SHA entries and CLI SHA. Legacy graph/v2 plans are not accepted.
- `node --test worker/test/domesticTodayGraphRecovery.test.js`: 5/5 pass. Current runtime Q1 comment connector returns authenticated nested comments and reply targets; local `flattenCommentTree` preserves root and parent. Project manager reported live MariaDB read-only `EXPLAIN INSERT` parser pass with 21 placeholders/21 parameters; QA did not independently issue that parser query.
- Manager-controlled result `graph-v3-comments-926761-page1-execution.json`: one page, `COMPLETED_COMMENT_TASK_AI_QUEUED`, two content IDs, two AI submissions, no reply targets, `allCommentsComplete=false`.
- Independent SELECT-only `v043_domestic_comment_926761_readonly_qa.js`: `PASS_COMMENT_926761`, no issues. Rows `6881998` at `2026-10-09T01:44:15.000Z` and `6882133` at `2026-10-09T03:19:51.000Z` belong to the exact source/account/community and post root; each has post as parent, depth 1, ID-matched provider raw, original in-window time, allowed Q1 post URL and nonempty text. Both light AI jobs match stored fingerprints: one completed, one pending at the snapshot. Task checkpoint `fa0709f9-4d4b-47eb-84b7-0971898f9e9c` is `completed`, `items_fetched=2`, lease clear; account lock is free. Domestic today DB total was 118 at the snapshot (116 posts plus these two comments).
- First checkpoint query used SQL datetime literals, but checkpoint window columns contain ISO strings; this caused a QA query miss, not a product defect. Corrected exact ISO-window SELECT passed.

## Bounded continuation gate

Conditional GO only for the project manager to serially execute explicit already-persisted today post IDs with observed comments, each with `mode=comments`, one post, `maxPages=1`, the same source/account/site/window, the frozen 115-file closure and CLI SHA, and a unique new approved plan/output. Check the account advisory lock and target checkpoint lease immediately before each task. Reconcile every result independently: raw ID and source URL, root/parent/depth, original time, AI job fingerprint, reply-target durability, cursor/status/readback and lease release. Any missing context, malformed provider page, incomplete boundary, SQL/commit uncertainty or scope drift is NO_GO; do not blind-retry or widen to old posts, other feeds, overseas or the shared Worker.

This is not approval of all 49 remaining posts, full comments/replies, entire day, AI completion, scheduler health or release. The first-two-page post report verified 36/36; later 116 posts and external UI count were observed, but 116/116 raw-detail independent reconciliation remains pending.
