# 紧急内容漏推钉钉修复

Status: 已发布并完成实际发送回执验收
日期：2026-10-16

## 原因

X-Clash群路由已开启，授权有效至10/22，分钟推送任务正常运行。10/15的10条紧急内容均有当前正文对应的完成分析，无待完成深度任务。

漏推有三条路径：

1. 同批次任意内容分析未完成，整批推送等待；其他已分析的紧急内容被无关积压阻塞。
2. 批次曾包含失败分析，程序将其写为settled。后续重试成功仍被该标记跳过。父任务056117ab、f7b4e08e等有包含失败数量的旧终结记录，截图较新6条因此不再检查。
3. 实际推送包仍包含旧shared/riskModes.js，urgent只映射urgent，而页面已合并negative与urgent。截图10条数据库等级均为negative，因此运行包不会选中。最初预演及测试仅引用工作区shared，遗漏了这一发布依赖差异；实际上线核对runReadiness风险数为0后发现并补齐。

## 修改

- `worker/src/collectionDingTalk.js`：采集根任务及子任务全部结束后，逐内容检查当前版本及待分析状态，先推已完成内容；其余内容保持等待。失败数非零的旧终结标记允许重新检查，已有发送日志继续去重。
- 使用任务保存的window_start/window_end筛选发布内容；旧独立任务未保存窗口时，按北京时间“采集开始至前一天00:00”推导。时间缺失或窗口非法时不发送。首次预演发现未保存窗口的独立任务会夹带数月前内容，补此边界后才发布。
- `worker/test/collectionDingTalk.test.js`：更新逐内容等待预期，新增失败重试补推、窗口/时区及非法窗口测试。
- 发布包同步现有`shared/riskModes.js`，与页面“紧急告警=negative+urgent”保持一致。终结标记增加deliveryVersion，旧等级口径产生的终结记录重新检查；发送回执去重键不变。
- last-run增加按运行任务统计的runReadiness，记录内容、待分析、旧版本分析、失败及命中紧急规则数量，便于识别“页面有内容但推送匹配0条”。

未修改API、前端、分析/采集服务、群路由及凭证，未改数据库结构。只切换现有分钟任务的运行包。

## 自测与发布

- 工作区28项自动测试通过；将同一测试入口重定向至实际运行包后，28项同样通过。语法、git diff --check通过。
- 现役增量包：`C:/ProgramData/PublicOpinion/releases/release-20261016-settled-content-sender-r3`，428文件manifest及依赖验证通过。
- 原包及任务XML备份保留；未手工调用机器人发送接口，使用既有自动推送任务。
- 只读真实数据预演预计19条：X-Clash13条（10/15截图10条及10/14另3条）、Last Light6条。采集范围外历史内容未进入该最终预演。
- 证据：`.tests/2026-10/2026-10-16/urgent-delivery-tests.tap`、`urgent-delivery-release-tests.tap`、`urgent-delivery-diagnosis.json`、`urgent-delivery-readiness.json`、`urgent-delivery-dedupe.json`、`urgent-delivery-preview.json`。

## 发送保障与限制

发送前保留机器人配置核对、数据库全局锁、持久化发送占用日志及限速。超时或不明确的回执不会盲目重发。接口成功回执证明机器人服务接受发送，不等同于确认每位群成员已经阅读。

2026-10-16 09:05:40（北京时间）核对实际回执：成功19条，失败0条，发送中0条。其中X-Clash共13条（10/15截图中的10条全部成功，另补齐10/14漏推3条），Last Light共6条。使用既有自动任务发送，未手工调用发送接口。

实际回执证据：`.tests/2026-10/2026-10-16/urgent-delivery-receipts.json`；自动任务运行结果：`.tests/2026-10/2026-10-16/urgent-delivery-live-run.json`。既有消息发送回执继续用于去重。

## 自测复盘

冻结运行包后，依赖manifest只能证明包内依赖可加载，不能证明共享业务规则与工作区一致。此后涉及等级、权限、窗口等共享契约的改动，应将相关行为测试直接指向拟上线运行包；此次新增实际包回归，旧shared会使多项negative合并推送测试失败。
