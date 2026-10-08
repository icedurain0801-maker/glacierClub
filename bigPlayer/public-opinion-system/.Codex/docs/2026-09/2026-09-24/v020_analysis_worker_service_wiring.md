---
status: pending-review
scope: public-opinion-system
---

# v020 AnalysisWorker 独立服务接线

## 背景与根因

本机 `PublicOpinionAnalysisWorker` 已以 WinSW 临时安装并运行，但仓库缺少对应 XML 模板、渲染入口和管理说明；仅依赖本机配置无法重复核对或恢复。采集 Worker 与分析消费者应保持独立，不通过重跑真实 Run 或修改采集数据处理队列。

## 变更

- 新增独立 WinSW 模板，固定 `LocalService`、自动延迟启动及 5/30/60 秒失败恢复。
- 渲染脚本支持显式生成 AnalysisWorker 配置，`ServiceName=All` 同时生成 API、Worker 和 AnalysisWorker；状态脚本纳入查询。
- 管理脚本默认 dry-run；Preflight 只读验证当前 Worker release/env、已安装实例的入口、配置、包装器哈希及恢复策略；Apply 仅供获授权后对尚未安装的服务执行。
- 没有更改已有本机 XML、服务、生产 env、采集数据或 gate。

## 验证与边界

- PowerShell 解析、`-Mode Preflight` 和状态脚本 `/query` 已通过；本机 Worker 和 AnalysisWorker 均为 `Running` / `Auto`，各自的 Node 子进程入口正确，共用 release `worker-release-taptap-20260921-v055-formal1` 与 `public-opinion.env`。TranslationWorker 当前为 `Stopped`，不在本次改动范围内。
- `.tests/2026-09/2026-09-24/v021_analysis_worker_all_render.test.ps1` 在仓库根 `.temp` 隔离验证 `All` 的三份 XML 及分析服务入口、环境、启动与恢复契约，已通过且清理测试输出。
- P0 回归补齐 `rollback-services.cmd` 受控 `/apply` 服务列表：依次 API、Worker、AnalysisWorker；卸载失败或已安装服务缺少包装器时立即退出，旧任务仍需依据导出的 XML 手动恢复。`.tests/2026-09/2026-09-24/v022_analysis_worker_rollback_contract.test.ps1` 的默认 dry-run 与门禁/顺序契约通过，未执行 `/apply`。
- `/api/public-opinion/analysis/progress?scope=q1-latest` 返回 HTTP 200，但 `batch_unavailable` 的零值不是积压已清零；`scope=filters` 全量查询 20 秒超时。本轮没有取得新的队列数量证据，保留此前 686 → 681 / completed 5 作为已知基线，不推断后续进度。
- 未执行 Apply、未重启服务，队列后续进展仍需按实际只读 API 证据确认。
- 待开发负责人审核脚本后，再交测试负责人做运行态只读回归；v004 boardId 改动仍为暂停、未交付状态。
