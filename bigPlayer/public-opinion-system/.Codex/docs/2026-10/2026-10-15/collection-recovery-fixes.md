# 三项采集异常修复

Status: released；Discord本轮完成，X-Clash恢复执行中，TapTap续抓受平台非JSON响应阻挡

## 变更

1. X-Clash/通用队列：运行中的队列轮询也执行有界过期回收，保留租约与fencing；回收不受执行槽是否空闲影响。轮询不再等待长采集结束，已延迟退出的任务可在到期后重新进入公平池；正在执行或已进入公平池的同一任务仍去重。RATE_LIMITED排队与尚未到next_retry_at的任务不被过期排队回收误判为毒任务。
2. Discord：复用工作区已有的最多5次限流重试规则，定向补入现役版本；在服务端Retry-After基础上使用至少5秒起的指数退避。现役Worker启用按主机/凭据摘要串行请求闸门。频道消息页一次收集帖子及回复，取消逐帖再次全频道查评论；保留回复contentType、父ID、层级与评论统计/关联，includeReplies=false仍生效。较大频道通过分段断点继续，累计页数与时间有上限。
3. TapTap：单段分页预算不再等于整轮结束。每段提交游标，下一段重新领取相同检查点继续，默认最多50段、硬上限100段，单阶段最长30分钟；上限到达仍保留部分完成，不伪造完成。页面提交后及时入分析队列，随后失败不抹掉已提交页面。

## 文件

- worker/src/worker.js：退避、混合消息身份、分段采集与队列轮询。
- worker/src/workerScanLease.js：保留有效延迟任务。
- server/src/connectors/discordConnector.js：请求闸门及频道回复随消息页采集。
- server/src/db/repository.js：Discord混合页面的评论关联与计数。
- worker/test/collectionRecovery.test.js、worker/test/worker.test.js：新增回归及退避断言调整。

## 验证

- 定向隔离测试19项通过；冻结现役运行包测试12项通过；其他相关定向回归10项通过。
- 源码语法与定向git diff --check通过（仅CRLF提示）。
- 较宽的worker筛选14项中13项通过，旧用例runOnce prefers queued run仍缺必填采集窗口，BIGPLAYER_EFFECTIVE_WINDOW_REQUIRED；未放宽窗口规则。本轮不宣称全量通过。
- 冻结当前Worker后精确叠加变更，保留其他现役功能；不将整个工作区worker/repository覆盖现役。只切换Worker服务，未新增服务、未提交Git。

## 真实恢复与副作用

- X-Clash 9612a1eb-9c7c-4195-ba14-3571dd4531d7在14:56过期后，原扫描后续已自动接续。发布前通过正常控制接口请求暂停，15:18:33在安全页后进入paused；扫描租约自然释放后切换Worker，随后恢复queued，15:20开始执行。
- Discord最新失败任务5b95416d-ea71-4033-832f-ccc487853165与TapTap最新部分完成任务a75dd99e-7a42-45ff-9cf1-99660f33e224按原任务ID恢复队列，保留窗口、内容与检查点。重试基数的一次性恢复记入po_audit_events，未批量回灌历史。
- 复验另发现X-Clash同批次b2c39401-04e8-41dd-8aa5-df4844ccb2a8在发布前15:09:59因两条SYNC_PAGE_TIMEOUT结束为部分完成，追加一次同任务断点恢复并保留诊断审计。
- TapTap越过原20页预算后，在第44页收到HTTP 200 text/html，原MALFORMED_RESPONSE合同信息保留在审计，安全游标为from=430；冷却60秒后仅追加一次恢复。15:24:57同页仍失败。只读响应检查确认HTML包含验证相关脚本标记，不是JSON、应用壳或404，未绕过验证。原分页预算问题已修复，但本任务尚未完成补齐，平台有效响应恢复前不可宣称通过真实完整采集验收。
- Discord于15:24:03进入completed_authorized_scope，error_code为空，任务累计fetched_count=7370、comment_count=690。新任务第一次执行即完成，未再次出现原逐帖扫描评论引起的限流风暴。
- X-Clash当前9612a1eb任务仍有有效租约，原过期/账号忙错误为空；同批次b2c39401超时站点已queued等待同账号串行接续。尚未宣称父批次完整完成。

## 浏览器

可见浏览器在club-opinion.q1.com运行记录页面核对X-Clash、Last Light/Discord及超能世界/TapTap，使用平台筛选后可看到对应任务。已确认Discord新回复计数增长，X-Clash排队/运行状态随恢复变化；TapTap页面明确显示第44页MALFORMED_RESPONSE与15:24:57失败终态，未将部分结果展示为成功。

运行包路径见collection-recovery-release.json；隔离验证及实际恢复证据见.tests/2026-10/2026-10-15/collection-recovery-*、collection-fix-live-recovery.json、x-partial-retry-once.json、tap-html-retry-once.json。
