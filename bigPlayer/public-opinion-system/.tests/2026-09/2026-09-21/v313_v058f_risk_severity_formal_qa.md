---
status: passed_with_static_scope_only
priority: P1
date: 2026-09-21
role: test-owner
candidate: v058f-risk-severity-formal-integration-20260921
---

# v058f 风险分级正式落盘盲测与回归报告

## 结论

**PASS（本次授权的静态盲测与回归范围）**。

未执行真实 `--phase=write`、数据库操作、服务切换、发布或 push。真实 AI/DB/API/告警落库链路不在本次授权范围内，不能由本报告替代真实写入验收或发布验收。

## 候选身份与范围

- 候选目录：`.temp/candidates/v058f-risk-severity-formal-integration-20260921/`
- manifest SHA256：`1BB0CFFCF660124FA421C1615F024CFE2E9080C308F3B7260A14537AE525FE1E`
- `READY.json`：`status=ready`，manifest SHA256 与独立复算一致
- 正式落盘增量仅六个文件：normalizer、Q1 runner、regular Worker 及各自测试文件
- 六文件核对：5/6 与候选逐字节一致；`worker/test/worker.test.js` 仅 EOL 差异，`git diff --no-index --ignore-space-at-eol` 无业务差异

## 回归结果

| 门禁 | 命令/方法 | 结果 |
|---|---|---|
| 风险定向、Q1、Worker | `node --test --test-concurrency=1 server/test/riskSeverityNormalizer.test.js worker/test/q1DailyAnalysisRunner.test.js worker/test/worker.test.js` | `107/107 PASS` |
| v065c 多站点反向回归 | `node --test .tests/2026-09/2026-09-21/v307_multisite_chain.test.js` | `7/7 PASS` |
| v154 反向回归 | `node --test .tests/2026-09/2026-09-20/v001_reputation_trend_neutral_series.test.js` | `3/3 PASS` |
| v302 内存模拟 | `node .tests/2026-09/2026-09-21/v302_risk_severity_real_samples.js --phase=simulate` | `SIMULATION_PASS` |
| Worker 全量 | `npm --workspace worker test` | `262/263 PASS`，1 项既有基线失败 |
| Server 全量 | `npm --workspace server test` | `484/493 PASS`，9 项既有隔离/环境失败 |

## 重点行为

- `919167`、`919098` 的风险升级测试通过。
- negative 至少为 `attention`、positive 强制 `normal`、neutral 不继承父级风险、非法 severity 审计、`analysisReason` 截断审计均通过。
- Q1 缓存非法 severity 进入共享 normalizer；Q1 与常规 Worker 均验证 positive/normal 在告警前 reconciliation，失败时可重试且不通知。
- v302 simulate：`firstPassInserts=4`、`replayInserts=4`、`aiCalls=1`、`audits=1`、`alertStatus=false_positive`。
- v065c 父子 Run、站点隔离、请求证据和风险逻辑保留检查通过。
- v154 三类情感、`unclassified` 排除与中性为 0 的布局合同通过。

## 已知基线失败

不影响本次 PASS，均不在 v058f 六文件增量内：

- Worker：`loads scheduler candidates with one deterministic default-account join`，实际对象额外含 `config: undefined`；候选 baseline 已记录。
- Server：9 项失败位于 source configuration、credential、sync-run 和多站点路由的隔离/环境依赖区域；与候选 baseline 所列“server full isolated candidate”失败区域一致。当前正式工作树总测试数为 `493`，与候选隔离环境的 `490` 不同，故仅按失败区域和增量无关性核对，不将计数差异伪报为新回归。

## 安全边界确认

- 不运行真实 `--phase=write`。
- 不连接或写入数据库。
- 不启动、重启、切换服务；不访问 `3001`。
- 不发布、不 push。

若后续申请真实写入验收，必须另行提供受控 runId、样本及前后只读快照，并按 v312 的 R6-R8、R12 执行；本报告不自动放行该阶段。
