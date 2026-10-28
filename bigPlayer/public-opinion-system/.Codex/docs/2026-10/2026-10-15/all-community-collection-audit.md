# 全社区抓取记录只读检查

检查时间：2026-10-15 14:59–15:05（北京时间）。仅查询、浏览器核对及保存检查结果，未重试、停止、删除或修改业务任务。

## 范围

- 本机现役数据库共有44个社区，5个社区配置了启用的采集来源，合计7个启用来源。38个社区无来源，另有1个SDK测试社区仅有停用来源，不将这些社区的无记录判为采集失败。
- 查询近7天创建记录以及全部仍处于queued/running的任务；另外检查pausing/paused/cancelling，无此类任务。
- 首次快照245条（含父批次和子任务，不能等同245轮采集）：completed_authorized_scope 120、completed 55、partial 30、failed 33、cancelled 4、running 2、queued 1。
- 近7天同来源同scheduled_at的父任务未发现重复；未发现更早仍未结束的任务。历史时间混用本地时间与UTC，未依据created_at与started_at简单相减判定耗时。

## 结果

| 社区/来源 | 结果 | 证据与影响 |
|---|---|---|
| Last Light / Discord | 当前异常，优先排查 | 近7天29条均未完整完成：23条failed、6条partial。最近14点任务5b95416d-ea71-4033-832f-ccc487853165重试4次后SYNC_RUN_POISONED，保留原因为评论第2页RATE_LIMITED；历史单条attempts最高567，重试治理需专项检查。不能将已抓取数量视为全部完成。 |
| 超能世界 / TapTap | 持续部分完成 | 近7天8条全部PARTIAL_SYNC；最近任务a75dd99e-7a42-45ff-9cf1-99660f33e224诊断为SYNC_PAGE_BUDGET_EXHAUSTED（owned_content分页预算耗尽），存在覆盖不全风险，缺失量待确认。 |
| X-Clash / BigPlayer | 一条旧任务状态异常，另一条真实任务仍有进度 | 9612a1eb-9c7c-4195-ba14-3571dd4531d7仍running、遗留SYNC_ACCOUNT_BUSY，14:51:15后未更新，租约14:56:15已过期；b2c39401-04e8-41dd-8aa5-df4844ccb2a8持续更新且租约有效。页面两条均显示同步中，不能据此认定两条同时实际执行。父批次尚未结束。 |
| Last Light / BigPlayer | 最新批次已完成，历史有异常 | 当前14点父批次c4bf0dd7-f825-4d74-a8fa-9a075a356c6f于14:54:20完成，浏览器合计抓取35、评论72；历史有OVERSEAS_COMMENT_PARENT_SCOPE_CONFLICT、语言配置不可用等记录，历史是否补齐需另核对。来源last_success_at及调度last_status仍保留旧值，不能单凭摘要字段认定本轮失败。 |
| 超能世界 / BigPlayer | 最新正常 | 近7天30条全部授权范围完成。 |
| 欢乐战三国 / BigPlayer | 最新正常，历史有部分完成 | 近7天15条：13条授权范围完成、2条partial；最新14点任务成功。 |
| 我要当老祖 / BigPlayer | 最新正常，历史有凭据异常 | 近7天22条：21条授权范围完成、1条CREDENTIAL_NOT_FOUND；最新14点任务成功。 |

## 浏览器复核

通过可见浏览器在club-opinion.q1.com运行记录页核对超能世界、Last Light及X-Clash，已按任务ID与现役库对应。Last Light最新父任务完成、X-Clash两个子任务显示同步中与上述一致。该页面来源选项只提供BigPlayer来源，Discord/TapTap结论来自现役数据库及结构化错误诊断，未宣称其页面详情已验证。lfy3001入口在当前浏览器身份下跳回只读概览，未绕过鉴权。

## 建议顺序

1. 检查X-Clash过期任务自动回收与同账号锁串行的交互，避免父批次长期不结束；修复前不要强行解锁正在工作的账号。
2. 单独治理Discord限流退避、重试上限及评论断点，BigPlayer限流器不能替代Discord请求治理。
3. 检查TapTap分页预算与断点接续，确认业务需要的时间范围覆盖。
4. 对齐Last Light来源/调度摘要与最新批次完成状态，并单独评估历史部分完成范围。

原始只读快照：.tests/2026-10/2026-10-15/all-community-collection-audit.json；补充诊断（已脱敏）：all-community-collection-details.json。
