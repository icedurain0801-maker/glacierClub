# 钉钉补推时间范围与标注

Status: 已发布并完成自动任务运行验收
日期：2026-10-16

## 用户确认的规则

按北京时间内容发布时间，只推送今天与昨天的内容，包括故障修复后的补推。今天正常显示；昨天的卡片标题、正文标题均添加“【补推 YYYY-MM-DD】”，正文另说明原发布日期。前天及更早的历史积压、非法或缺失时间、未来时间不发送。紧急告警、关注级、优质内容统一遵守，既有消息回执继续去重。

## 实现

- `worker/src/collectionDingTalk.js`：在已有采集窗口内追加当前北京时间日历范围校验，过期内容不阻塞其他内容分析就绪判断；发送前再次检查时间，避免限速队列跨午夜后仍发过期内容，卡片使用同一发送时间生成补推标注。
- `worker/test/collectionDingTalk.test.js`：固定测试时钟及发布时间，新增三类推送的历史拦截、补推标注、去重、午夜边界及发送中跨日测试。
- `AGENTS.md`：记录用户确认的补推边界，后续修复继续执行。

## 验证与发布

工作区及实际发布包分别31项测试通过；语法、空白检查通过；实际包428文件manifest及依赖校验通过。实际包测试证据：`.tests/2026-10/2026-10-16/recent-backfill-release-tests.tap`。

仅更新现有计划任务 `PublicOpinion BaaS DingTalk Alerts` 的运行包到 `C:/ProgramData/PublicOpinion/releases/release-20261016-recent-backfill-sender-r1`。切换前确认旧推送进程已退出，切换后任务Ready，保留原触发器和发送回执。未更改API、前端、数据库结构、机器人配置或凭据；未手动补发任何消息。任务XML备份位于仓库根 `.temp/opinion-push-cards/dingtalk-task-before-recent-backfill.xml`。

此前已发到群里的历史消息不会因本次修改自动撤回。

09:16:47（北京时间）自动任务完成新包首次运行：sent=0、failed=0、waiting=0，计划任务退出码0、状态Ready。Last Light旧批次b59e1998原先193条内容、6条风险，本轮符合今天/昨天范围为0，历史内容已被过滤；已有发送回执继续去重，本轮没有重复发送。实际运行证据：`.tests/2026-10/2026-10-16/recent-backfill-live-run.json`。昨天卡片标注由实际运行包自动测试验证，未为验证额外向群发送测试消息。
