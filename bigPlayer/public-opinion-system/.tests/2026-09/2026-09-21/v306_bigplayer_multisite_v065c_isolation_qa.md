---
status: failed
priority: P1
date: 2026-09-21
role: test-owner
candidate: v065c-bigplayer-multisite-execution-chain-20260921
---

# BigPlayer 多站点 v065c 候选/正式路径隔离 QA

## 结论

FAIL。v065c 候选内部测试通过，但 formalFiles 与当前正式工作树不一致，无法证明串行落盘不会回退既有风险 P1；不得执行 migration 029、真实 Run 或发布。

## 候选完整性

- manifest：`142/142` 文件 hash 校验通过。
- manifest SHA-256：`E213548B11D73E466EC09AA83B9870537260F241ED0617E2DCE7B44079062EBE`，与交测一致。
- 候选专项 `tests/v065b_multisite_chain.test.js`：`7/7 PASS`。
- 候选映射 Server/Worker 关键回归：`295/295 PASS`。
- v307 正式门禁：`7/7 PASS`。
- 候选 formalFiles 语法检查：`7/7 PASS`。

## 正式路径隔离结果

formalFiles 共 14 个，独立映射到当前正式仓库后：`12 MATCH / 1 MISMATCH / 1 MISSING`。

### 唯一根因：formal snapshot 未同步当前风险持久化基线

`server/src/db/repository.js` 候选 hash 与正式路径不一致。差异不是多站点 schema admission 本身，而是候选版本缺少当前正式路径已有的风险 P1 修复：

- 候选 `insertAnalysis` 仅持久化 `analysis.reason`；正式路径已支持优先持久化 `analysis.analysisReason`。
- 正式路径已有 `reconcilePositiveRiskAlerts`，候选 snapshot 不包含该能力。

如果按 v065c formalFiles 覆盖正式文件，会回退 v058d 已验收的风险审计持久化和 positive alert reconciliation。

同时，manifest 声明的 `tests/v065b_multisite_chain.test.js` 在正式仓库路径不存在；当前正式专项位于 `.tests/2026-09/2026-09-21/v307_multisite_chain.test.js`。因此 formalFiles 本身不可在正式路径完整复现。

## 已确认通过的 v065c 行为

- 缺 migration 029、缺 `site_url_snapshot`、缺 `last_request_at` 时 scheduler schema admission fail-closed。
- 逐站 checkpoint/window 隔离。
- 父子 lease/epoch fencing、parent cancel/resume 与 child finalization 控制态保护。
- 单启用站仍为 parent + child；全停用返回 `MULTISITE_SITE_REGISTRY_MISMATCH` 并回滚。
- request evidence 位于真实 fetch 边界；UI 源码包含 `errorCode` 与“最后请求”字段。
- registry 对账保留已有 `auth_status/capabilities`。

## 范围确认

- 未执行 migration 029。
- 未启动真实服务、未创建真实 Run、未写 DB、未改服务/代码、未发布/push。
- `worker/test/schedulerCandidateLoader.test.js` 的既有 `config: undefined` 断言失败未作为本次新增缺陷；本次 FAIL 原因是 formal snapshot 与正式风险基线不一致。

## 退回开发负责人

请重建 v065c formal snapshot：保留当前正式路径的 `analysisReason` 持久化与 positive alert reconciliation，并将专项测试路径与正式仓库实际位置统一；重新提供 14 个 formalFiles 的一致映射后再交测。
