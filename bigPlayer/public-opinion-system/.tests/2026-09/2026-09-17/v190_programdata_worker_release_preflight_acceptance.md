# v190 PublicOpinionWorker 运行包与零副作用 preflight：独立验收

- 验收日期：2026-09-17
- 验收角色：测试负责人
- 范围：Worker 隔离构建、manifest、API-only Worker preflight、只读 DB readiness 与租约/epoch 回归。
- 边界：未执行 Worker `/apply` 或服务控制；未重启或修改 API、旧任务、生产 ProgramData、数据库、`.env`、ACL、发布或数据补跑。

## 验收结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| 独立 Worker release 闭包 | PASS | 运行包包含 worker、必要 server/shared/Q1 脚本和生产依赖；排除 API 入口、worker 测试和 `.env`。 |
| manifest 与负例 | PASS | 405 文件 manifest 通过；worker 入口篡改被拒绝。 |
| Worker 模式与间隔 | PASS | preflight XML 断言 `WORKER_MODE=enabled`、`UNIFIED_SOURCE_SCHEDULER_MODE=enabled`、`WORKER_INTERVAL_MS=60000`。 |
| ACL 分离 | PASS | release/services/config 为 LocalService 只读；logs/data（含 locks/state）为 Modify。 |
| reparse / 依赖逃逸 / 用户路径 | PASS | release verifier 与 preflight 对 reparse、allowlist、绝对路径泄漏执行拒绝；临时 release 通过验证。 |
| API-only Worker preflight | PASS | 使用锁定 WinSW SHA-256；临时 release/XML/ACL/Node/Python 依赖通过。 |
| DB readiness | PASS | `worker-readiness.js` 仅允许 SELECT/SHOW；实际 preflight 完成 schema、lease、epoch 只读准入。 |
| 租约、epoch 与防重复 | PASS | `schedulerRepositoryAdapter`、`workerScanLease`、`q1DailyJob` 回归共 34 项通过，覆盖条件租约、epoch fencing、重复 slot 和过期恢复。 |
| 旧任务并存 | PASS | preflight 前后旧任务状态未变，且 Worker `/apply` 明确保持禁用，未触发采集。 |
| 零副作用 | PASS | Worker 未安装；API 持续 Running、4320 DB `ok`；3001/3306、生产 ProgramData、监听 PID 与旧任务快照未变化；worker preflight 残留为 0。 |

## 结论

**PASS。** Worker 的 ProgramData 独立运行包与只读 preflight 门禁通过，可由项目经理决定是否另行授权 Worker 真实安装。测试负责人未执行、也未授权 Worker `/apply`。
