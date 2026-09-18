# v157 Windows 常驻服务阶段 B1：迁移前门禁验收

- 验收日期：2026-09-17
- 验收角色：测试负责人
- 结论：**PASS — 允许按已授权顺序执行真实 024→025→026 迁移**
- 本次性质：仅迁移前静态与自动化门禁；本报告不代表真实迁移已执行。

## 已覆盖

| 检查项 | 独立证据 | 结果 |
| --- | --- | --- |
| 026 仅做加法与幂等补齐 | `026_scheduler_runtime_schema_reconciliation.sql` 只含条件 `ALTER TABLE ... ADD COLUMN lease_epoch`、`CREATE TABLE IF NOT EXISTS po_worker_heartbeats` 与 information_schema 合同检查 | PASS |
| 禁止危险语句 / 数据改写 | 静态扫描确认无 `DROP`、`TRUNCATE`、`RENAME`，无针对 `po_sync_runs` 或 `po_schema_migrations` 的业务 `UPDATE` / `DELETE` | PASS |
| 026 合同 | `schedulerRuntimeReconciliationMigration.contract.test.js`：`3/3 PASS`，覆盖 migration history 不编辑、epoch 幂等补齐、完整 heartbeat 表/索引合同 | PASS |
| 023/025/026 ledger admission | `workerUnifiedSchedulerSeam.test.js` 相关场景 `6/6 PASS`；缺运行期 migration、worker lease / heartbeat 合同或 023 运行列/唯一索引时均 fail-closed | PASS |
| 运行期准入 | `repository.js` 和 `worker.js` 均要求 023、025、026 ledger，且核对 `po_sync_runs.lease_epoch`、`po_worker_leases` 全列和 `po_worker_heartbeats` 9 列 | PASS |
| 语法 | 四个涉及 JS 文件 `node --check` 均成功 | PASS |

## 待确认 / 阶段边界

- MariaDB DDL 隐式提交，真实迁移前仍应由开发按已拍板顺序执行并记录每个版本的 ledger 与 schema admission 实际结果；测试不修改、重跑或删除 023 ledger。
- 026 不重放 023；它只补齐已登记 023 的数据库可能缺失的运行期对象。`po_worker_leases` 由 025 建立，准入同时要求 025/026。
- 真实 DB 断连恢复、服务安装与强杀、catchup、三层页面/API、Worker 状态及 24 小时观察为 B1 后续分段验收项，本报告不替代它们。

## 允许的下一步

开发可在用户已授权范围内执行真实 `024→025→026`，随后交付：migration ledger、information_schema 准入结果、服务运行态和时间窗，以供下一阶段独立验收。
