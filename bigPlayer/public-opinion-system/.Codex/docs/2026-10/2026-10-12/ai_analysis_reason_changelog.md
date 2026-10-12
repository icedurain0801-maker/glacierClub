# 显示 AI 的具体分析原因

日期：2026-10-12

## 问题与结果

v8 风险归一化在校验等级后，用固定的 GATE 说明覆盖了 AI 返回的内容分析原因，详情出现“未提供可核查的具体问题”等重复句式。

本次保留 AI 针对当前内容返回的具体说明作为 `reason` / `analysisReason`。规则校验说明仍保存于 `riskDecision.reason` 用于审计，风险等级判定逻辑保持现行规则。原因按数据库现有 255 字符边界保存，解析上限由 120 调整为 255。

历史查询优先读取既有 `risk_context.rawAnalysis.reason`，缺失时读取原始 AI 风险说明，最后回退历史 `analysis_reason`。列表、详情以及评论树使用相同取值顺序。未批量重判、未重写历史数据、未额外调用 AI；没有保存原始原因的旧内容无法凭空恢复。

## 文件

- `server/src/services/riskSeverityNormalizer.js`：保留具体 AI 说明，重复归一化及持久化读取不再覆盖。
- `server/src/integrations/aiAnalyzer.js`：原因长度与数据库边界一致。
- `server/src/db/repository.js`：只提交原因 SQL 辅助表达式及两个查询投影，不包含工作区其他改动。
- `server/test/analysisExplanation.test.js`、`server/test/riskDecisionTree.test.js`：覆盖原始说明、缓存、持久化、历史兼容及等级校验说明。
- `.tests/2026-10/2026-10-12/ai_reason_*`：数据库及可见浏览器验收记录。

## 验证

工作区及基于 HEAD 加本次暂存文件的独立目录均通过 74 项测试。独立目录首次漏带已提交的重判脚本，补齐验证工件后全部通过；没有为此修改业务代码。

候选运行包基于各服务最新现役目录复制，只覆盖本次三个文件，并验证 manifest：API 401 文件、两个 Worker 各 411 文件。部署目标为 `20261012-ai-specific-reason` 运行包。

真实只读查询核对评论 6886734 和动态 927469：列表及详情返回值与已保存 AI 原文完全一致，风险等级仍为关注。可见 Edge 正式站点验收及真实接口结果见 `ai_reason_browser_result.json`。本次未启用图片分析，未修改前端文件、数据库结构、通知或处理状态。
