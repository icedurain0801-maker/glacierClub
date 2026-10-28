# 抓取任务记录加载性能优化

日期：2026-10-15

## 变更

- `server/src/db/repository.js` 的 `listSyncRuns` 列表查询只返回当前分页记录，并将帖子、评论、回复统计合并为一次批量查询，避免每条记录执行相关内容统计子查询。
- `admin/PublicOpinion/assets/collection-runs.js` 将筛选项加载与任务记录首屏请求并行执行，避免筛选接口阻塞列表展示。
- `admin/PublicOpinion/collection-runs.html` 更新脚本版本号，避免浏览器继续使用旧缓存。

## 验证

- `node --check server/src/db/repository.js`
- `node --check admin/PublicOpinion/assets/collection-runs.js`
- `node --test server/test/syncRunPageCounts.test.js`：通过。
- 已生成并切换本机 API/前端候选运行包：`release-20261015-collection-runs-fast-1792071000000`。
- 浏览器本机服务验证了新版脚本加载；外部 `club-opinion.q1.com` 当前仍返回已托管的旧脚本版本，需后续静态托管发布后才会显示新版脚本。

## 说明

未执行 Git commit 或 push。未修改采集、分析和数据内容逻辑。
