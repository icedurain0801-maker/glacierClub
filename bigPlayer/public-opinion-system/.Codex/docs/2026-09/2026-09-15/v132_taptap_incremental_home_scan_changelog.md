# v132 TapTap 增量首页扫描变更记录

日期：2026-09-15

## 问题

- 境内“超能世界国服版”TapTap 在 `2026-09-14` 的抓取内容管理页帖子、评论均为 0。
- 数据库中的最近定时任务抓取到历史内容但新增为 0，`owned_content` checkpoint 停在深页游标；TapTap 游标为绝对偏移，增量任务复用该游标会跳过首页。

## 核查结论

- 源站 group 首页最新帖子为 `2026-09-12 10:00:00Z`，因此 `2026-09-14` 帖子为源站真实 0，不补造数据。
- 评论探针扫描前 200 帖，结果为 `scannedPosts=200`、`activeCount=0`、`verified=[]`，未发现 `2026-09-14` 的真实新评论。
- 本次没有证据支持扩大到评论排序或旧帖评论回看，相关行为保持不变。

## 实现

- TapTap `owned_content` 的 `incremental` 同步每次以 `cursor=null` 从首页启动，确保优先发现新帖。
- TapTap `backfill` 继续复用 checkpoint 深页游标。
- 其他平台、TapTap 评论阶段及其他 task kind 继续复用原 checkpoint 游标。

## 验证

- `node --test --test-name-pattern "TapTap 增量 owned_content|分页根阶段" worker/test/worker.test.js`：2/2 通过。
- `node --test worker/test/worker.test.js`：75/75 通过。
- `node --check worker/src/worker.js`：通过。
- `git diff --check -- worker/src/worker.js worker/test/worker.test.js`：通过；仅有工作树换行符提示。

## 范围与风险

- 未修改频率、详情抽屉、翻译、其他来源或评论抓取策略。
- 增量首页扫描仍受 `SYNC_PAGE_BUDGET` 限制；TapTap 回填的深页续跑能力不受影响。
- 未 Mock、未手工造数、未 push、未发版。
