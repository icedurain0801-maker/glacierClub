# BigPlayer API v027 候选 QA 报告

- 候选：`release-20260920-1621-v027`
- 结论：**FAIL，禁止发起新的 incremental sync**

## 通过项

- `package-release-manifest.json` SHA 为 `7E9891948E797639841011A043CAF2ED32FEA1BC6B13CA09A6B151164E5FA3C1`。
- manifest `393` 条目逐文件校验 `0 mismatch`；候选目录共 `394` 文件（含 manifest）。
- API XML 已指向该 release；ACL 受保护；4320 health `200`；PublicOpinionApi Running。
- 运行包 `connectorAccountHealth` 保留 source 对象并单独附加 `account`，不再将 `source.id` 改为 `account.id`。
- 运行包 `authRefreshCoordinator` SHA 为 `06D97C4BD5643CE3396013AAC6C3CB260C477BA0283510B81849E2A42EBD10FB`，包含 `ACCOUNT_BINDING_CONFLICT` 与 `ACCOUNT_SCOPE_MISMATCH` 透传。
- Worker 服务 PID `40168`、LoginSession 服务 PID `39744` 均保持 Running；4311 health/readiness 正常。
- source/account 定向路由用例和 authRefreshCoordinator 4 项透传用例通过。

## 阻塞项

执行：

```text
node --test server/test/authRefreshCoordinator.test.js server/test/app.routes.test.js
```

结果：`69` 项中 `67 PASS / 2 FAIL`。

失败用例：

1. `GET sync run observability routes return latest state, enforce scope, and validate cursors`
2. `GET /sync-runs lists safely with strict pagination validation`

共同错误：测试数据库缺少 `r.parent_run_id`，导致 `ER_BAD_FIELD_ERROR` 并返回 500。

尽管该失败未直接否定 source/account 修复，完整回归未全绿，不满足本轮“全部 PASS 后才允许唯一 sync”的硬门禁。禁止发起新的 sync，待开发修复测试 schema/迁移一致性并全量回归通过后重新交测。
