# 周报摘要默认折叠
Status: candidate-verified-awaiting-browser
Date: 2026-10-19

## 已确认需求
用户仅询问“暂无有效情绪分析”的含义，不要求补跑逐条情感分析或调整分析规则。本次仅将摘要默认显示前三行，提供“展开全文／收起”。不提交推送Git，BaaS静态托管等用户单独确认。

## 核查
TitanWarSA本期周报冻结统计为319条、已分析0条。只读查询确认同期内容没有po_analyses记录；周报生成直接读取原文，因此周报有原文摘要并不等于已有逐条情感结果。Titan两社区分析任务存在pending状态。未修改业务数据、补跑历史、调整分析窗口或采集规则。

## 改动
- ../admin/PublicOpinion/assets/weekly-report.js：完成态摘要默认is-collapsed；按钮aria-expanded/aria-controls；点击展开/收起，不改摘要文本和统计数据；社区切换加载时恢复默认折叠。
- ../admin/PublicOpinion/index.html：三行CSS截断及按钮样式，更新weekly-report.js缓存版本为20261019-collapse-r1。

## 验证及发布状态
node --check及git diff --check通过；周报HTTP权限接口与周报回归8项通过。
从最新现役前端release-20261019-weekly-r2复制候选release-20261019-weekly-r2-summary-collapse-r1，仅覆盖以上两个文件；48文件manifest验证通过。
候选仅loopback预览端口7790，代理既有API，不修改鉴权。浏览器工具当前仅MCP Apps可用，iab/edge均报告Browser is not available，Codex打开预览返回queued；已弹窗请用户恢复浏览器连接。
尚未浏览器验收、尚未切换本机现役前端、未发布BaaS静态托管，Git未提交未推送。保留候选和预览以便继续验收。
