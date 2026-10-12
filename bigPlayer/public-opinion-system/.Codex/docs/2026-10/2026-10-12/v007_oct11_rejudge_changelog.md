# 10月11日历史风险重判

Status: completed

## 用户授权范围

只重判北京时间2026-10-11 00:00（含）至2026-10-12 00:00（不含），境内、超能世界国服版社区 `00000000-0000-0000-0000-000000000101`、`bigplayer_h5` 已分析且未删除的451条内容：帖子/动态148、评论303。其他日期和社区不加入此次重判。

## 执行逻辑

持有常规消费者同名互斥锁，按原文执行light分析，对需要深度分析的内容再执行deep，并以最终结果应用v6规则。先保存原始快照，再核对内容fingerprint，通过带事务审计的现役Repository写入分析和缓存。已有v6结果不重复处理，已收到的批次保存后可用于恢复。只结束相同fingerprint和分析版本的pending/retryable任务，不改其他任务。

此次重判不调用AlertEngine，不创建历史告警，不补发历史通知，不修改已有历史告警事件。

## 发布遗漏修复

第一次落库在第6条遭遇MariaDB errno4025：`po_analyses_severity_chk`只允许normal/attention/urgent，未包含新增negative；前5条已成功落库。补充 `migrations/032_progressive_risk_severity.sql`，只扩展这个CHECK约束，保留校验和原数据。已执行并核实，记录迁移版本。该ALTER实际重建表，执行期间相关查询等待或变慢，完成后服务恢复。

同时修复r2运行包analyzeBatch漏传原文参数的问题。API、Worker、AnalysisWorker分别克隆各自r2为r3，仅修改aiAnalyzer的一行parseResponse参数并携带032迁移。工作区aiAnalyzer已有正确实现，不重复重写；未发布其他并行开发变更。r2运行包和服务XML备份保留。

## 验证

- 工作区AI解析与风险规则41项隔离测试通过。
- 三个r3候选分别使用模拟AI响应验证原文投诉证据，均正确从neutral低分升级到negative。
- 语法和空白检查通过；API与frontend健康检查均200；三个切换服务均Running。
- 全部451条已使用v6策略，剩余旧策略0，内容ID集合与原始快照完全一致；其中98条完成deep分析。
- 最终独占等级：normal361、attention21、negative69、urgent0。递进卡片为关注90（21+69）、负面待处理69、紧急0。
- 实际启动可见Chromium，访问真实外网10/11筛选页面，无请求拦截；卡片451/90/69/0，帖子/动态148、评论303，关注列表90、负面列表69，均与数据库一致，无pageerror。已视觉检查卡片截图。
- 既有告警事件仍显示1，与严重内容0分别统计；此次未补发历史通知或修改既有事件。

期间一次AI响应格式校验失败、两次深度分析超时均未作为有效结果落库。按旧策略剩余集合恢复，复用保存的有效批次；受控脚本针对无效输出有限重试并拆小批次，最终轮只对本次重判延长请求超时至90秒。正常服务超时配置未改。五次写入进度为5、80、30、180、156条，合计451。

`v005_oct11_rejudge_result.json`记录最后一轮156条的执行统计，其中currentLevels和remainingOldPolicy来自全范围核对；`v006_oct11_rejudge_verification.json`为全部451条最终结果。最后一轮usage/calls只覆盖该轮，不代表全部重判费用或调用总量。

## 证据

- 受控脚本、原始快照、收到的批次、错误诊断和XML备份：仓库根 `.temp/risk-rejudge-oct11/`，不提交原文快照。
- 重判执行结果：`v005_oct11_rejudge_result.json`。
- 最终范围和等级核对：`v006_oct11_rejudge_verification.json`。
- 浏览器证据：`.tests/2026-10/2026-10-12/oct11-rejudge-live-browser.json` 与 `oct11-rejudge-live-cards.png`。
