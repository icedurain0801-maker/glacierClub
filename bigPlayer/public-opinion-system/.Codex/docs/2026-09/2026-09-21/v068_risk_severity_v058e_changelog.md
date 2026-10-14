---
status: qa_passed_static_scope_only
date: 2026-09-21
candidate: v058f
manifest_sha256: 1BB0CFFCF660124FA421C1615F024CFE2E9080C308F3B7260A14537AE525FE1E
run_id: risk-v058d-real-20260921-3e462961
---

# 风险分级 v058e 变更记录

## 合并原则

- 只提取 `v058d -> v058e` 的风险专属差异，叠加到已落盘的多站点 v065c 基线。
- 不整文件覆盖 `repository.js`、`worker.js` 及其测试，避免回退多站点逻辑。
- 真实写阶段必须包含真实 AI 分析；当前脚本未满足前不得执行。

## 文件状态

| 序号 | 路径 | 状态 |
|---:|---|---|
| 1 | `server/src/db/repository.js` | applied_with_analysis_reason_restore |
| 2 | `server/src/pipeline/alertEngine.js` | applied |
| 3 | `worker/src/q1DailyAnalysisRunner.js` | applied_with_v058f_analysis_reason |
| 4 | `worker/src/worker.js` | applied_on_v065c_baseline_with_v058f_analysis_reason |
| 5 | `server/test/repository.test.js` | applied |
| 6 | `server/test/alertEngine.test.js` | applied |
| 7 | `worker/test/q1DailyAnalysisRunner.test.js` | applied_from_v058f |
| 8 | `worker/test/worker.test.js` | applied_from_v058f |
| 9 | `.tests/2026-09/2026-09-21/v302_risk_severity_real_samples.js` | simulate_pass_write_not_executed |
| 10 | `server/src/services/riskSeverityNormalizer.js` | applied_from_v058f |
| 11 | `server/test/riskSeverityNormalizer.test.js` | applied_from_v058f |

## 验证

- v058f 六文件增量已串行落盘；其中 5 个文件与候选逐字节 SHA256 一致，`worker/test/worker.test.js` 仅换行符不同，`git diff --no-index` 无内容差异。
- 正式路径风险定向组合：`262/262 PASS`。
- 正式路径多站点组合：`64/64 PASS`。
- Worker 全量：`262/263 PASS`；唯一失败为既有 `loads scheduler candidates with one deterministic default-account join`，实际对象较预期多出 `config: undefined`，本次无新增失败。
- v302 模拟：`SIMULATION_PASS`，`firstPassInserts=4`、`replayInserts=4`、`aiCalls=1`、`audits=1`、`alertStatus=false_positive`；未执行真实 `--phase=write`。
- `git diff --check`：PASS。
- 禁止在 QA 阶段执行真实写入、数据库迁移、服务切换、发布或 push。

## 测试负责人结论

- 结论：`PASS`，仅覆盖本次授权的静态盲测与回归范围。
- 报告：`.tests/2026-09/2026-09-21/v313_v058f_risk_severity_formal_qa.md`。
- 风险/Q1/Worker 定向：`107/107 PASS`；v065c：`7/7 PASS`；v154：`3/3 PASS`。
- Server 全量：`484/493 PASS`；9 项为 source/credential/sync-run/multisite 隔离环境既有失败，均不在 v058f 六文件增量范围。
- 本结论不放行真实 `--phase=write`、数据库操作、服务切换、发布或 push；后续高影响阶段须另行授权。

## 受控真实写入口修复

- 项目经理转达用户已弹窗授权固定四样本真实写验收后，写前门禁发现 v302 脚本仍指向旧候选 `v058e`，已在写入前停止，未产生数据库写入。
- `.tests/2026-09/2026-09-21/v302_risk_severity_real_samples.js` 已绑定候选 `v058f-risk-severity-formal-integration-20260921` 与固定 manifest SHA256 `1BB0CFFCF660124FA421C1615F024CFE2E9080C308F3B7260A14537AE525FE1E`，并兼容新版 `READY.json` 的 `manifest.sha256` 字段。
- 修复后门禁：Node syntax PASS；simulate `SIMULATION_PASS`；只读 preflight `READY_FOR_WRITE_APPROVAL`，`sampleCount=4`。
- 真实 `--phase=write` 尚未在本记录更新时执行；仍须保持无通知 fail-fast、四样本唯一性与越界即停规则。

## 受控真实写结果

- 批次：`risk-v058d-real-20260921-3e462961`；候选 manifest SHA256：`1BB0CFFCF660124FA421C1615F024CFE2E9080C308F3B7260A14537AE525FE1E`。
- 结果：`FAIL_STOPPED`，错误 `REAL_AI_SENTIMENT_MISMATCH`，样本 `919098` 的真实 AI 情感结果与固定基线不一致。
- 停止位置：AI 批量分析完成后、任何持久化写入前；`aiAnalyzeBatchCalls=1`、`analyzedSampleCount=4`。
- 数据影响：`controlledAlertCreates=0`、`analysisUpserts=0`、`reconciliationStateChanges=0`、`reconciliationAudits=0`、`notificationAttempts=0`。
- 证据：`.tests/2026-09/2026-09-21/evidence/v302-risk-v058d-real-20260921-3e462961/preflight.json` 与 `write-failure.json`。
- 已禁止自动重跑、放宽情感断言或修改验收口径；本次真实写验收不通过，需项目经理决定后续处置。
- 测试负责人独立复核：`FAIL/STOPPED`；报告 `.tests/2026-09/2026-09-21/v314_v058f_real_samples_fail_stopped_qa.md`。复核确认 preflight `dbWrites=0`、before alerts 为空、messageTables/outbox 为空、`servicesUntouched=true`，不得推导为真实 PASS。

## 只读根因定位

- 唯一根因：真实四样本验收脚本存在跨 profile/model 的测试硬断言基线错配，定性为测试错误，不是 sentiment 解析映射或风险 normalizer 错误。
- `919098` 的历史 `negative` 标签来自 `deep / gpt-5.6-luna / sentiment-v1`；本次脚本固定调用 `light / gpt-4.1-mini / sentiment-v1`，却要求 light 输出严格等于历史 deep 标签。
- `parseResponse()` 仅对合法 sentiment 枚举执行小写后原样映射；`normalizeSeverity()` 只归一化 severity，不改 sentiment，因此现有代码链没有将 negative 错映射为其他 sentiment 的路径。
- 证据缺口：`write-failure.json` 未保存本次原始 AI 响应、实际 `s` 或实际模型字段，只能确认结果为合法的非 `negative` 枚举，不能进一步断言是 `neutral` 或 `positive`，也不能归因到某一句提示词。
- 最小修复路径 1（推荐）：真实四样本验收固定使用产生基线的 deep profile/model，保留 `919098=negative` 严格断言，并将 profile/model/version 与原始解析结果写入 evidence。
- 最小修复路径 2：继续使用 light 验收，但替换为经同一 light profile/model 独立校准并批准的明确负面样本，继续保留严格 sentiment 断言。
- 两条路径均未执行，须由项目经理另行决策并取得相应授权。
