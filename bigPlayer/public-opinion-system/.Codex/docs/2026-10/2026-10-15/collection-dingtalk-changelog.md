# 采集结束后钉钉紧急告警推送

- 需求：每次采集结束并完成本轮 AI 分析后，将本轮新增/变更的紧急告警发到社区绑定钉钉群。
- 实现：推送任务每分钟检查已结束的采集根批次，等待其子批次和分析任务稳定；按社区路由汇总 negative/urgent 内容，部分完成批次带提示，分析失败内容计数提示。
- 去重：按机器人、内容 ID 和 fingerprint 持久化批次日志；复用旧告警/手动推送日志，超时回执不自动重发。
- 发布：现役任务已切换到 `C:/ProgramData/PublicOpinion/releases/release-20261015-collection-ding-r1/worker/src/baasDingTalkRunner.js`，仍每分钟运行。
- 验证：`worker/test/collectionDingTalk.test.js` 与既有钉钉隔离测试共16项通过；JS语法和 `git diff --check` 通过；可见 Edge 浏览器核对 X-Clash 今日页面和紧急告警卡片。
- 说明：本次未触发真实业务告警发送，运行检查结果为 sent=0；浏览器检查不代表群成员已读。
