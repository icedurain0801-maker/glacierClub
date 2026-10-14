---
status: verified-in-isolation
scope: BigPlayer 多站点 Worker 子 Run 执行切片
---

# BigPlayer 多站点子 Run：站点上下文与 Checkpoint 隔离

## 变更

- Worker 领取到带 `site_id` 的 BigPlayer 子 Run 时，从已保存的 `config.siteUrls` 精确解析同 ID 的启用站点，并仅为该次执行将连接器上下文的 `baseUrl` 替换为该站点 URL。
- `syncStage` 的 checkpoint 读取与领取均透传 `siteId`；同一账号、任务与窗口的不同站点不再共享 cursor。
- 子 Run 的站点不在保存配置中或已经禁用时，Worker 以 `MULTISITE_SITE_CONTEXT_NOT_FOUND` fail-closed，绝不回退到兼容字段的首站 `baseUrl`。
- 未携带 `site_id` 的旧单站 Run 保持原有 source/config 与 `site_id IS NULL` checkpoint 语义。

## 隔离证据

- 模拟领取 `site_id=second` 的子 Run：连接器只收到 `second` 的 URL 上下文，checkpoint 领取参数为 `siteId=second`。
- 缺失站点的子 Run 在连接器调用前终止，记录精确错误码。

## 验证

```text
node --test --test-name-pattern "BigPlayer multi-site child run|legacy no-slot paged source" worker/test/worker.test.js
# 4/4 PASS

node --check worker/src/worker.js
# PASS

git diff --check -- worker/src/worker.js worker/test/worker.test.js
# PASS
```

## 边界与后续

- 本次仅覆盖隔离 Worker 子 Run，不执行真实数据库迁移 `027`、服务部署/重启、真实 Run 或补跑。
- 定时子 Run 创建、父 Run 聚合、前端站点级进度及真实库迁移门禁仍待后续切片。
