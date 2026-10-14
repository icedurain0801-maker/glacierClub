# v022 AnalysisWorker 服务接线独立 QA

- 日期：2026-09-24
- 范围：只读服务接线回归；未执行 Apply、重启、真实 Run、数据写入或 gate 变更。

## 结论

`FAIL_ROLLBACK_BOUNDARY`

AnalysisWorker 的运行态接线通过，但统一回滚边界未覆盖该新服务，不能给出完整服务接线 PASS。

## 通过项

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 实际状态 | PASS | `PublicOpinionApi`、`PublicOpinionWorker`、`PublicOpinionAnalysisWorker` 均为 `Running / Automatic`。 |
| 独立消费者常驻 | PASS | 实际 Node 进程入口为 `...worker\\src\\analysisWorker.js`。 |
| 同 release / env | PASS | `manage-analysis-worker.ps1 -Mode Preflight` 返回 AnalysisWorker `Running`，与 Worker 共用 `worker-release-taptap-20260921-v055-formal1` 和同一 `public-opinion.env`。 |
| 启动与恢复 | PASS | SCM 为 `AUTO_START (DELAYED)`；失败恢复为 restart 5s、30s、60s；账户是 `NT AUTHORITY\\LocalService`。 |
| 渲染覆盖 | PASS（静态） | `render-config.ps1` 的 `ServiceName=All` 明确生成 API、Worker、AnalysisWorker。 |
| 状态查询 | PASS | `/query` 只读查询返回 API/Worker/AnalysisWorker 已启动；TranslationWorker 为 Stopped，不在本次范围。 |
| 队列口径 | 仅记录 | `analysis/progress?scope=q1-latest` 返回 `batch_unavailable` 和零值，不能作为队列清零证据。 |

## 阻断项

`scripts/windows-services/rollback-services.cmd` 的 `/apply` 循环仅包含 `PublicOpinionApi PublicOpinionWorker`，不会停止或卸载 `PublicOpinionAnalysisWorker`。若执行统一回滚，分析消费者可能继续运行，违反本次要求的服务安装/回滚边界完整性。

## 建议

由开发负责人补齐 AnalysisWorker 的受控回滚路径（默认 dry-run、显式高影响 `/apply`），并在不操作生产服务的前提下交回归验证。
