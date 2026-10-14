# v053 风险归一化冻结候选独立验收 FAIL

日期：2026-10-10。候选：candidate-8JLSfB，policy positive-normal-negative-50-game-complaint-v5。结论：必要旧缓存/缺语义字段场景有实际缺陷，整体不签PASS，已退开发及经理。

## 实际缺陷

三个冻结runtime（api/analysis/collection）的同一最小调用均失败：

```js
normalizeAnalysisResult(
  { sentiment: 'negative', severity: 'attention', negativeScore: 0.1, confidence: 1 },
  { body: '请问bug修复公告在哪看？' }
)
```

预期attention，实际urgent。缺gameComplaint布尔字段时，normalizeSeverity回退hasGameIssueSignal；裸bug关键词即触发game_issue_upgrade，没有明确投诉语义。普通咨询不应因关键词机械升级。显式gameComplaint=false路径通过，说明新语义输出不覆盖旧结果/缓存缺字段漏洞。不是真实926895的最终情感结论，更不对其缺全文作投诉判断。

## 已通过的独立范围

- 冻结15文件SHA、runtime manifest SHA `064e78d0cc6f59ab2cf0abf8d8207a1bd2953bb66fbbab63c27240dd156eb38b`、16项overlay输出/runtime候选及声明的基底SHA全部匹配。
- QA执行指定runner fresh MariaDB，独立datadir `risk-isolated-db-MlYuHb`、127.0.0.1:13316/serverId20261036。实际三包仓储写入/缓存/指纹变化重新入队/过期指纹拒绝/风险数量/概览SQL，以及loopback contents/overview API通过，exit0。自建实例停止、端口释放。
- 自有补充用例跨三包共30PASS/3FAIL，exit1。已通过0.499/0.500/0.501且confidence0边界、低分明确语义投诉、已有原等级urgent保留、中性中奖率咨询不升、正面normal和质量推荐字段/原模型结果/重复归一化保留、有效原文投诉证据、虚构证据拒绝、显式非投诉咨询不升。

## 证据与剩余范围

仓库根 `.temp/risk-isolated-db-MlYuHb/result.json` 为QA实际独立隔离执行；`.temp/qa-v053-risk-cases-1791614373054.json` 为QA自有必要反例执行；脚本为同目录 `v053_risk_independent_cases.cjs`。

候选整体FAIL后不扩大运行无关矩阵。审计写入的事务与raw/previous字段已源码阅读，runner核实际审计rawAnalysis存在；审计故障回滚、真实目标记录全文复核/纠偏、历史通知不补发、完整轻深和持久缓存缺字段路径尚未独立全部签收。开发309单测与前候选PASS只作背景，不替代这些未核范围。待最小修复重冻结，再补受影响的必要验收。

本轮不接生产库、不发真实抓取/付费AI，不部署、不生产纠偏。不能称真实926937/926923已normal，926869/926910/926895已修复，或存量全量修复。仅新增QA脚本/报告，业务代码未修改。
