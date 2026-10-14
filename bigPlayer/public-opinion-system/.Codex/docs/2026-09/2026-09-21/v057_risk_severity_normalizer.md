# 风险等级确定性归一化

- Status: completed
- Date: 2026-09-21

## 变更

- 新增 `server/src/services/riskSeverityNormalizer.js`，统一处理正面、负面、游戏问题和高负面置信度的最终风险等级。
- AI severity 提示词升级为 v4，明确正面内容为 normal、负面至少 attention、游戏问题为 urgent，并禁止按互动量升级。
- worker 持久化主路径、回退路径和 Q1 日分析 runner 在写入前统一归一化，并保留 `originalSeverity`、`severityNormalizationReasons`。
- 不继承父帖风险；neutral 保持模型等级。

## 验证

- `node --check`：相关 4 个源文件通过。
- `node --test server/test/riskSeverityNormalizer.test.js server/test/aiAnalyzer.test.js`：32 项通过。
- `node --test server/test/riskSeverityNormalizer.test.js worker/test/worker.test.js worker/test/q1DailyAnalysisRunner.test.js`：100 项通过。

## 范围

本变更不触发历史回算、告警通知、抓取、评论采集或生产运行时操作。
