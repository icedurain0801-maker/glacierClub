# v236 Worker-only 真实 controller 接线隔离验收

- 测试日期：2026-09-20（北京时间）
- 测试类型：同一 CLI 的 fake controller 端到端隔离回归
- 边界：未触碰 ProgramData、Windows 服务、API/3001、DB、补跑或发版；未执行真实 apply

## 结果

| 场景 | 结果 | 关键断言 |
|---|---|---|
| 默认/真实或非 fake apply | PASS | controller 创建或服务命令前返回 `REAL_APPLY_UNAUTHORIZED` |
| fake controller success | PASS | 固定 `PublicOpinionWorker` controller 成功路径 |
| state 映射 | PASS | fake 覆盖 `sc.exe query` 对应 Worker state 语义 |
| stop/install/start 映射 | PASS | 均绑定 Worker wrapper 命令，不涉及 API |
| readiness 失败 | PASS | 仅 Worker 回滚 |
| rollback 失败 | PASS | 进入 `MANUAL_STOP_REQUIRED`，不全局 rollback |
| preflight failure | PASS | 在事务前停止 |
| 工件门禁 | PASS | 同参数 fake 路径校验 hash、非链接/父路径 reparse、API 快照；API/3001 不变 |
| 定向自动化 | PASS | `node --test .tests/2026-09/2026-09-20/v229_worker_only_controlled_cli.test.js`，最新 13 passed / 0 failed |
| 语法/空白 | PASS | `node --check scripts/windows-services/worker-only-controlled-cutover.js`；`git diff --check` 通过 |

## 结论

Worker-only controller 接线及 fake 故障演练 **PASS（隔离）**。按项目经理 QA 口径，当前非 fake `--apply` 仍无条件拒绝、`--preflight` 仅为静态材料检查，因此状态是“合同 PASS、发布入口未就绪”；不能据此称已切换或线上恢复。
