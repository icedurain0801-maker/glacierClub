# v021 风险梯度修正

## 变更

风险分级继续使用可核查证据决策树：个人抽奖结果、奖励少、情绪短句和计划内维护公告保持关注级；积分显示与实际未增加、明确的技能/能量异常、活动结束时间与原定安排矛盾进入负面待处理；紧急告警只保留有严重影响证据的内容。新增产品问题证据修复，允许后端在模型漏填风险对象时依据原文补齐，且保留原始分析结果。

## 历史校正范围

仅针对超能世界国服版、BigPlayer、北京时间 2026-10-06 00:00 至 2026-10-12 00:00 的未删除内容。预演基线为 normal 4495、attention 433、negative 1、urgent 10，目标为 normal 4598、attention 333、negative 6、urgent 2；涉及 113 条分析和 111 条缓存。校正通过内容指纹、事务锁和审计记录保护，禁止历史告警补发，不修改处理状态。

## 文件

- `server/src/services/productIssueEvidence.js`
- `server/src/services/riskDecisionTree.js`
- `server/src/services/riskSeverityNormalizer.js`
- `scripts/reconcile-risk-gradient.js`
- `.tests/2026-10/2026-10-12/risk_gradient.test.cjs`
