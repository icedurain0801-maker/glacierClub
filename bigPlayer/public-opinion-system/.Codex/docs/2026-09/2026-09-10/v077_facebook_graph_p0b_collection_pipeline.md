---
last_updated: 2026-09-10
status: implemented
scope: facebook-graph-p0-b
owner: 开发负责人
source_plan: .Codex/docs/2026-09/2026-09-10/v075_facebook_graph_page_source_delivery_plan.md
---

# v077 Facebook Graph P0-B 采集链路实施记录

## 实施结果

- Facebook 帖子、评论、回复接入三层分页；每层游标绑定 Graph 版本、层级和资源 ID，禁止跨层级或跨资源复用。
- Meta `paging.next` 仅用于提取 `after`；复验固定 HTTPS Graph 主机、版本和资源路径后重建请求，不跟随原 URL，也不把 Token 写入游标。
- 帖子、评论和回复统一映射正文、发布时间、permalink、作者及内容指纹；评论保留帖子根节点，回复保留直接父评论和二级深度。
- 回复复用现有评论断点域：`sync_scope=comments`、`task_kind=facebook_reply`、`task_key=reply:<commentId>`、`root_platform_content_id=<postId>`，无需 schema 迁移。
- 每页内容事务提交成功后才推进 checkpoint；失败保留最后安全游标。首页失败记 `failed`，已有成功提交页后的后续分页失败记 `partial`。
- 三层内容沿用幂等入库；首次新增及正文变化进入 light AI，未变化内容不重复入库计数、不重复进入 AI。
- Facebook 采集纳入既有 sync-run claim/lease 与账号锁，同账号并发任务互斥；授权失效、Page 不匹配或权限撤销继续 fail-closed。

## 文件

- `server/src/connectors/facebookGraphConnector.js`
- `worker/src/worker.js`
- `server/test/facebookGraphConnector.test.js`
- `server/test/facebookCollection.contract.test.js`
- `worker/test/worker.test.js`

## 验证

```powershell
node --check server/src/connectors/facebookGraphConnector.js
node --check worker/src/worker.js
node --test --test-concurrency=1 server/test/facebookGraphConnector.test.js server/test/facebookCollection.contract.test.js server/test/facebookSecurity.contract.test.js server/test/sourceValidators.test.js server/test/connectors.test.js worker/test/worker.test.js
git diff --check -- server/src/connectors/facebookGraphConnector.js server/test/facebookGraphConnector.test.js server/test/facebookCollection.contract.test.js worker/src/worker.js worker/test/worker.test.js
```

- 主验收：125/125 PASS。
- 独立 P0-B 合同复核：9/9 PASS；与连接器、安全、来源校验联合复跑：54/54 PASS。
- Worker 独立回归：71/71 PASS。
- 语法检查与定向差异检查：PASS。
- 未调用真实 Facebook 或 Konga，P0-D 仍为 `not_admitted`。

本阶段未 commit、未 push、未合并、未发版；P0-C 尚未开始。
