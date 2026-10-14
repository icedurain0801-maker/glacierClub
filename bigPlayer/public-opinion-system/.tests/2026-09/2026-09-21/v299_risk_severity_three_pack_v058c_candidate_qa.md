---
status: failed
priority: P1
date: 2026-09-21
role: test-owner
candidate: v058c-risk-severity-three-pack-current-baseline-20260921
---

# 负面风险分级三包 v058c 独立盲测报告

## 结论

FAIL。候选不可复现，且当前可测实现不满足非法 severity 审计和 `analysisReason` 审计后缀/保留/幂等的交测契约。不得进入真实 AI、DB、告警、历史回算或发布验收。

## 范围与限制

- 仅测试 `.temp/candidates/v058c-risk-severity-three-pack-current-baseline-20260921` 与当前工作树的隔离候选证据；未启动服务、Worker、API、同步 Run、真实 AI、DB、告警或历史回算。
- 未执行浏览器验收：本交测是后端隔离候选，未提供可验证的页面/读模型样本。
- manifest SHA-256 复算为 `0BCAC538D33A27F9FCA23BF65B6D560C6697686F393CF5EED23A3B97E22012DA`，与交测值一致。

## 验收结果

| 项目 | 结果 | 证据 |
|---|---|---|
| 919167/919098 游戏问题升为 `urgent` | PASS（当前基线） | `server/test/riskSeverityNormalizer.test.js` 通过；两个样本均命中 `game_issue_upgrade`。 |
| 普通 negative 最低为 `attention` | PASS（当前基线） | 同上，`negative_floor_attention` 用例通过。 |
| positive 强制 `normal`、neutral 不继承父风险 | PASS（当前基线） | 同上，2 项用例通过。 |
| 非法 severity 在 positive/neutral/negative 均记录 `invalid_severity_defaulted` | FAIL | `normalizeSeverity({ severity: 'bogus' })` 分别得到 `[]`、`[]`、`['negative_floor_attention']`，没有要求的审计原因。 |
| 常规 Worker 生成紧凑审计后缀 | FAIL | `normalizePersistedAnalysis` 只返回 `severityNormalizationReasons`，未设置 `analysisReason`。 |
| 保留已有 `analysisReason` 且重复归一化幂等 | FAIL | 同一函数未处理 `analysisReason`；候选声明的 `worker/test/riskSeverityIntegration.test.js` 在工作树缺失，无法复现。 |
| Repository 持久化审计后缀 | FAIL | `insertAnalysis` 写入参数为 `analysis.reason`，未读取候选测试声明的 `analysis.analysisReason`；候选声明的 `server/test/riskSeverityPersistence.test.js` 缺失。 |
| Q1 与常规路径审计契约一致 | FAIL | Q1 先把非法 severity 静默折叠为 `normal`，再调用 normalizer，审计来源丢失；候选对应 hash 与当前文件不符。 |
| 告警前等级一致性 | BLOCKED | 候选集缺少对应集成测试且当前实现与候选 hash 不一致；未按范围启动真实告警。 |
| 候选完整性与基线无回退 | FAIL | manifest 的 12 项中只有 `server/src/integrations/aiAnalyzer.js`、`server/test/aiAnalyzer.test.js` 两项与工作树 hash 一致；`baseline-diff-evidence.json`、`server/test/riskSeverityPersistence.test.js`、`worker/test/riskSeverityIntegration.test.js` 在声明相对路径缺失，其余 7 项 hash 不符。 |

## 已运行的只读验证

- `node --test server/test/riskSeverityNormalizer.test.js worker/test/q1DailyAnalysisRunner.test.js`：12/12 PASS。仅证明当前基线的既有 12 项，不可作为 v058c 的 46/46 或 250/250 替代。
- `node --check server/src/services/riskSeverityNormalizer.js`、`server/src/db/repository.js`、`worker/src/worker.js`、`worker/src/q1DailyAnalysisRunner.js`：4/4 PASS。
- 独立枚举 manifest：2 MATCH / 7 MISMATCH / 3 MISSING；候选根目录实际仅含 `README.md`、`baseline-diff-evidence.json`、`manifest.json`、`package.json`，没有 manifest 所声明的源码与测试快照。

## 缺陷退回

1. P1：在 shared normalizer 保留原始非法 severity 的可判定性，并对 positive、neutral、negative 均追加 `invalid_severity_defaulted`。
2. P1：常规 Worker 与 Q1 统一构造并持久化截断安全的 `analysisReason` 审计后缀；已有审计必须保留，重复归一化不重复追加。
3. P1：Repository 应持久化统一后的审计字段，补齐常规 Worker/Q1/告警前相同等级的可执行隔离测试。
4. P1：提供可复现候选快照，或将 manifest 明确绑定到一套 hash 一致的工作树；补齐缺失的三份声明文件后重新交测。

## 范围外与残余风险

真实 AI、DB、告警、阈值误报抽样、历史回算/重算、历史告警 reconciliation/no-notify 均未执行，仍需后续经授权的独立验收。
