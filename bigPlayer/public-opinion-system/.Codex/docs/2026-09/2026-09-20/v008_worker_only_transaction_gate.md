# Worker-only 事务切换与自动回滚门禁

状态：隔离自测通过；未授权执行真实切换。

新增 `scripts/windows-services/worker-only-cutover-transaction.js`。它没有 CLI，真实服务必须另行授权并注入受控 Worker 适配器；API/3001 无适配器入口。事务先快照 API hash 与 Worker wrapper/XML，切换后执行 readiness 并复核 API；失败自动恢复仅 Worker wrapper/XML、重新安装/启动旧 Worker。若回滚也失败，返回 `MANUAL_STOP_REQUIRED`：仅停止 `PublicOpinionWorker` 并升级，禁止全局 rollback。

`.tests/2026-09/2026-09-20/v227_worker_only_cutover_transaction.test.js` 在系统临时目录故障注入验证：预检失败、切换失败、readiness 失败均 `ROLLED_BACK`；回滚失败为 `MANUAL_STOP_REQUIRED`；四种场景 API wrapper/XML 都未变化。

```powershell
node --test .tests/2026-09/2026-09-20/v227_worker_only_cutover_transaction.test.js
# 4 passed
```

后续仍需：把已授权的真实 Worker 服务操作封装为受审计 adapter，并在新发布授权窗口内接入 v007 Runbook；本次未操作 ProgramData、服务、数据库或同步任务。
