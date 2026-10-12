# v023 AnalysisWorker 回滚边界独立 QA

- 日期：2026-09-24
- 范围：只读合约及运行态回归；未执行真实 `/apply`、停止/重启服务、数据写入、真实 Run 或 gate 变更。

## 结论

`PASS_SERVICE_ROLLBACK_CONTRACT_READ_ONLY`

## 证据

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 默认行为 | PASS | `rollback-services.cmd` 默认只输出 dry-run，未操作服务或旧任务。 |
| 受控回滚集合 | PASS | 仅在显式 `/apply` 后依次处理 `PublicOpinionApi`、`PublicOpinionWorker`、`PublicOpinionAnalysisWorker`。 |
| 缺包装器边界 | PASS（合约） | 某项包装器缺失但 SCM 服务存在时，脚本输出错误并 `exit /b 1`，不静默遗留服务。 |
| 卸载失败边界 | PASS（合约） | `uninstall ... || exit /b 1`，卸载失败立即以非零退出。 |
| 旧任务边界 | PASS | 仅提示依据导出的 XML 手动恢复，不自动修改旧计划任务。 |
| 独立合约 | PASS | `v022_analysis_worker_rollback_contract.test.ps1` 通过。 |
| 健康服务未受影响 | PASS | API、Worker、AnalysisWorker 检查后均为 `Running / Automatic`。 |

## 限制

根据授权，未执行真实 `/apply`，因此本报告不把静态/合约验证替代真实卸载回滚演练，也不声称已测试故障重启。
