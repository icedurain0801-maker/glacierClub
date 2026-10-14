# Last Night precise recovery input QA

Status: INPUT_BOUND / RECOVERY_CANDIDATE_NOT_YET_RELEASED
Date: 2026-10-09 (Asia/Shanghai)
Scope: independent local examination of the manager's redacted read-only checkpoint input. No live DB/provider query, retry or task mutation.

`C:/Users/Administrator/AppData/Roaming/Code/User project manage/.temp/bigplayer-recovery-20261009/lastnight-runtime-60JPM6/precise-recovery-checkpoints-input.json` independently hashes to SHA256 `e67ae0ef38a28f5c3889062a1369a0fe4452d247e523f6bfde714ce62b199f72`, matching handoff.

Exactly one failed row belongs to the current seven-day window (`2026-10-02T03:07:34.810Z` to `2026-10-09T03:07:34.810Z`): checkpoint `0205567a-70c3-4ca2-a416-456ef2f09a66`, site `legacy-8483...`, task `100017:circle:activity:552:564:5::1`, `ER_LOCK_DEADLOCK`, `items_fetched=3`. Its saved version-2 cursor has `pageIndex=1`, `offsetId=50`, `pagesFetched=1`, `timeOrderVerified=true` and `previousOldestPublishedAt=2026-09-08T06:17:49.000Z`. Four other failed rows for the same task key belong to September windows and are explicitly out of scope for this recovery.

The input also contains 23 completed `q1_feed` post descriptors from the completed language-9 run. They may bind language-16 first-feed scope; they do not authorize re-fetching language-9 pages.

**Recovery gate (corrected after code review):** `syncStagePage` calls `upsertContentPage` before assigning `stage.cursor=page.nextCursor`; the catch path persists the existing `stage.cursor` and `itemsFetched=discovered`. Thus the saved offset 50 can represent the last successfully committed page's next position, and `items_fetched=3` can represent previously discovered, committed items. Neither value proves three missing rows. A recovery candidate must resume the exact current-window task from saved offset 50, not reset to page 0 or skip further work solely because the preceding page's oldest item was 2026-09-08. It must preserve the page transaction/checkpoint advancement order and fail closed on ambiguous commit outcome. No new recovery implementation or live correction has yet been accepted by QA.
