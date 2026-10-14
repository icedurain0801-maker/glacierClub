# Domestic exact-list comment batch stopped at 926875

Status: PASS_45_SUCCESSFUL_POST_PAGES_69_COMMENTS / 926875_NO_GO / FOUR_LATER_TARGETS_NOT_RUN

The fixed 22-post list previously passed 22/22 intersection with the original independently verified 116 posts. During the remaining 16-post serial run, manager-controlled v4 plans added accepted comments until post `926875`. Its report is `FAILED_GRAPH` at `store_comment_page/comment_upsert/operation 6` with `ER_LOCK_WAIT_TIMEOUT`. The manager stopped; the later list entries `926876,926878,926884,926885` were not executed. Thus unresolved targets are `926875` plus those four.

Independent SELECT-only `v047_domestic_comment_batch_readonly_qa.js` reconciled 45 successful explicit pages, 69 comments: source/account/community, provider raw ID, original UTC, parent/root/depth, post URL, matching light AI-job fingerprint and completed lease-free checkpoints passed. For failed `926875`, exact checkpoint is idle/items_fetched 0/cursor null/lease-free and there are zero in-window child comments. Historical lock failures `926802` and `926820` were each recovered by a separately reviewed one-time run; their original failed reports remain as evidence. This new `926875` failure is not recovered.

NO_GO for `926875` retry and all four later targets until a separately frozen target-specific diagnostic candidate and plan pass independent QA. The earlier `926820` wrapper is hard-coded and may not be repurposed by merely changing a plan. Even a successful diagnostic reproduction would not establish the lock root cause if it records no wait; subsequent continuation needs its own bounded QA decision. No full-comment, nonhome-feed, full-day or release GO.
