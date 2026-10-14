# v234 Worker-only controlled CLI fake 端到端验收

- 测试日期：2026-09-20（北京时间）
- 测试类型：CLI fake controller 隔离端到端
- 边界：使用独立 `po-cli-fake-*` 临时目录；未连接真实 ProgramData、Windows 服务、API/3001 或 DB，未部署、重启、补跑、发版

## 结果

| 场景 | 结果 | 关键断言 |
|---|---|---|
| 默认无参数/真实 apply | PASS | 默认只读；真实 `--apply` fail-closed，返回 `REAL_APPLY_UNAUTHORIZED` |
| `--apply --controller=fake` 成功 | PASS | fake 接线端到端执行成功，`apiUnchanged:true` |
| fake 预检失败 | PASS | 失败仅 Worker 路径，`apiUnchanged:true` |
| fake 切换失败 | PASS | 失败仅 Worker 回滚，`apiUnchanged:true` |
| fake readiness 失败 | PASS | 自动仅恢复 Worker，`apiUnchanged:true` |
| fake rollback 失败 | PASS | 进入 `MANUAL_STOP_REQUIRED`，不触发全局 rollback，`apiUnchanged:true` |
| 定向自动化 | PASS | `node --test .tests/2026-09/2026-09-20/v229_worker_only_controlled_cli.test.js`，6 passed / 0 failed |
| 语法/空白 | PASS | `node --check scripts/windows-services/worker-only-controlled-cutover.js`；`git diff --check` 通过 |

## 结论

Worker-only controlled CLI 的 fake 端到端门禁 **PASS（隔离）**。默认、真实 apply 和非 fake 路径仍 fail-closed；API/3001 不变。该结果不代表真实服务可切换，真实 apply 仍需新的明确授权与生产环境预检。
