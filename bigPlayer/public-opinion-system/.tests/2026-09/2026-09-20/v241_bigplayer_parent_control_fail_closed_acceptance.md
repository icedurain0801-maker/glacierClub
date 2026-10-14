# v241 BigPlayer 父 Run 控制 fail-closed 验收

- 测试日期：2026-09-20（北京时间）
- 测试类型：repository/API/UI 隔离回归
- 边界：未连接真实 DB/服务，未执行迁移、重启、补跑或发版；不实现 parent→child 传播

## 结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| parent pause/cancel | PASS | API 返回 `409 MULTISITE_PARENT_CONTROL_UNSUPPORTED`，`controls=[]`，未触发 `requestSyncRunControl` |
| child 原 runId 控制 | PASS | child 仍按 `/sync-runs/<childId>/{pause|cancel}` 原路径处理 |
| legacy 原 runId 控制 | PASS | legacy 单站任务控制兼容保持 |
| UI parent 控制 | PASS | parent 汇总控制禁用并提示等待子站点；不伪造成功状态 |
| repository 全量 | PASS | `node --test server/test/repository.test.js`，139 passed / 0 failed |
| Dock UI 回归 | PASS | `node --test ../admin/PublicOpinion/assets/sync-run-dock.test.js`，8 passed / 0 failed |
| API 定向 | PASS | parent fail-closed 定向用例，1 passed / 0 failed |
| 语法/空白 | PASS | app/repository `node --check`；`git diff --check` 通过 |

## 结论

父 Run 控制 fail-closed **PASS（隔离）**。该实现拒绝假成功，但不提供 parent→child pause/cancel 传播；真实服务和 DB 仍未验收。
