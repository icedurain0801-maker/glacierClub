# Domestic captured-window final snapshot QA

Status: PASS_KNOWN_116_POSTS_AND_50_COMMENT_TARGETS / AI_193_COMPLETED_ON_RECHECK / FULL_DAY_AND_RELEASE_NO_GO

Scope: domestic BigPlayer source `5c21f78d-5f67-4467-963d-dcdeb5e26cab`, account `70c393cf-9600-11f1-b3d2-d85ed3ae61b0`, community 101, captured window ending `2026-10-09T04:31:29.177Z`. This is an observed-target snapshot, not whole-community/day completeness.

Independent `v045_domestic_116_readonly_qa.js` verified 116/116 reported home posts: exact ownership, original UTC, full provider detail ID/raw SHA, nondeleted content, fingerprint and light AI job. Independent `v047_domestic_comment_batch_readonly_qa.js` verified 50 successful one-post comment tasks and 77 comments: raw provider ID, parent/root/depth, original UTC, source URL, fingerprint-matched light AI job, and every task checkpoint completed with lease released. Three historical `ER_LOCK_WAIT_TIMEOUT` reports for 926802/926820/926875 remain preserved; each target later has a separately verified one-time successful report. No unresolved task failure remained in the 50-target inventory. Successful reports contain zero reply targets; this does not prove all possible replies or older parent posts were enumerated.

The target DB snapshot contains 116 posts + 77 comments = 193 in the Shanghai-day filter. The external content-management page visibly showed `帖子 116`, `评论 77`, with `第 1 / 2 页，共 77 条` in the comment list. The browser also visibly showed comment `6882174` as `待重试`, consistent with DB; no UI interaction triggered collection.

Independent `v052_domestic_150_ai_readonly_qa.js` found 191 of 193 content rows with completed light jobs and fingerprint-matched analysis results. Two comment jobs, external IDs `6882071` and `6882174`, are `retryable`, attempts 2, `error_code=SYNC_STAGE_FAILED`, fingerprint matched, no current lease, with `next_retry_at` populated. This is an AI completion gap, not an ingestion/count mismatch. Do not infer the cause from the generic code or manually retry/change the shared AI algorithm under this QA result.

At approximately 13:30 Asia/Shanghai, a subsequent independent SELECT-only recheck found **193/193 completed light jobs and 193/193 fingerprint-matched analysis results**. The two prior retryable states resolved through the existing asynchronous path without a QA/manual retry or algorithm change. The 191/193 state above remains a point-in-time observation, not the final AI state.

At 13:31:51 Asia/Shanghai, QA independently reran `v052_domestic_150_ai_readonly_qa.js` without collection or UI actions. It returned `PASS_CURRENT_AI_RESULTS`: 116 posts, 77 comments, **193/193 completed light jobs, 193/193 fingerprint-matched analysis results, 0 issues**. This full-set check includes the two formerly retryable comment IDs `6882071` and `6882174`; it confirms the current DB state, not the cause of their earlier retry or full-day collection completeness.

Remaining gates: home pagination exhaustion/older pages, nonhome feeds, all older-parent comments and nested replies, full-day coverage beyond the capture end, and real scheduler/Worker regression. Intermittent comment-upsert lock contention was not root-caused by zero-wait diagnostic samples. No production write, provider scrape or 3001 service start was performed by QA. No release GO.
