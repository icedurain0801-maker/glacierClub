# 分析失败传播和原因引用校验修复

Status: released

## 根因

TypeSafeAnalyzer.analyzeBatch 使用 Promise.all；单条原因生成失败会拒绝整批请求，Worker 外层异常处理将同批全部任务写为失败。现役按 100 条领取，少量错误被扩大为大量失败，且具体原因被统一覆盖为 ANALYSIS_REASON_REQUIRED。

逐条恢复后发现原因模块额外边界：来源原文正确但 quote 超过 60 字被拒绝；仅编号的 L0 文本模型会返回空 quote。现役分析包仍使用旧版说明模块。

## 修改

- server/src/integrations/typeSafeAnalyzer.js：增加 settleErrors 可选参数，Worker 使用逐条结算；默认严格调用仍拒绝失败。错误返回稳定代码，不打印供应商响应或密钥。
- worker/src/worker.js：逐条检查错误，仅失败项重试；同批成功项正常保存。
- server/src/integrations/typeSafeExplanation.js：先验证完整引用属于原文，再按 Unicode 字符截取展示长度；仅 L0 且原文为数字/短字母编号时，可将模型空引用补为完整原文。等级一致、中文原因、原文真实性校验继续保留。
- ../admin/PublicOpinion/assets/content.js：未分析成功且无情感结果的内容显示“待判定”，不误显示“正常”。

## 验证与实际结果

- 23 项回归通过，包括单条失败不影响同批成功、Worker 分项保存、严格调用、引用真实性、中文校验、并发和分析门禁。
- 长引用与短编号专项断言通过；风险等级和普通正文不能使用短编号兜底。语法、限定 diff 空白检查通过。
- 分析候选运行包执行新增 3 项测试通过；Worker 423 文件包校验、前端 46 文件包校验通过。
- 基于切换时最新运行包只合入相关改动，更新原因模块及其中文验证依赖。仅重启分析 Worker 和前端；不修改 API、数据库结构或采集器。旧包可回滚，XML 备份在仓库根 .temp/analysis-failures-20261014。
- 重试范围：北京时间 2026-10-14 发布的各社区失败内容（数据库 UTC 边界 10/13 16:00 至 10/14 16:00）。首次 391 条恢复 375 条；引用长度修复后剩 2 条；短编号修复后全部恢复。
- 最终数据库：1307 条完成，其中原有 916 条，本次恢复 391 条；范围内无 pending/running/retryable/failed。
- 线上 Last Light 当日帖子/动态共 9 条全部完成、0 条失败；截图 analysis-isolation-live.png，与截图原有失败平台 ID 所在范围一致。评论和其他社区的恢复由数据库汇总确认。
- 供应商未来仍可能返回不合法结果；任务会如实失败并保留具体原因，不伪造成功或降低风险等级。
