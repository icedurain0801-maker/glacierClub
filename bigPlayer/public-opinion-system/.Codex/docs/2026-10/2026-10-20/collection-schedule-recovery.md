# Last Light 停采与全社区调度排查

日期：2026-10-20。用户授权修复并直接更新现役；不推Git、不发布BaaS。

## 根因与修复

Last Light 2026-10-19 14:00北京时间的父任务 `331b75df-cf8d-4eed-b437-2f2be6281486` 留在queued。三条子任务中两条完成、一条被过期恢复逻辑标为SYNC_RUN_POISONED；该路径没有调用正常结束时的父任务汇总。父任务既不在可执行叶任务队列中，又被调度器视为活跃任务，因此阻挡后续计划。

`worker/src/workerScanLease.js` 增加终态父任务协调，并接入每轮过期恢复：仅对queued/running、无有效租约、所有子任务均终态且源/账号一致的父任务汇总计数，按现有成功/部分失败/全失败规则收尾；保留子任务失败证据。暂停、取消中、有效租约、未完成子任务及账号不符的任务不动。更新时再次校验状态和归属，递增epoch隔离旧拥有者。

8个境外单站点源另存在 `OVERSEAS_COMMENT_SITE_SCOPE_INVALID`：历史评论发现逻辑强制要求仅多站点子任务才携带的siteId。`worker/src/sharedOverseasCommentTargets.js` 只在已保存配置唯一启用站点时解析该站点；多站点继续要求显式站点、跨账号/社区/版块父内容继续拒绝。没有放宽归属校验或变更凭据。

## 验证

- 27项单元测试通过：恢复租约、调度适配、候选加载及新增单站点/多站点/跨版块测试，见 `collection-recovery-tests.txt`。
- 实际MariaDB连接的同名临时表隔离测试通过：部分成功、全成功、全失败、有效租约、未完成子任务、暂停、账号不符，以及最后子任务被poison后父任务同步收尾、重复执行幂等。未写真实业务表，见 `collection-parent-recovery-isolation.json`。
- 两个修改文件语法及指定文件diff空白检查通过。
- 最小运行包从原现役 `release-20261019-topic-collection-r1` 复制，只替换上述两个模块，439文件manifest验证通过；没有发布工作区其他Worker改动。
- 已直接切换 `PublicOpinionWorker` 到 `release-20261020-collection-recovery-r1`；旧XML保存于仓库根 `.temp/playwright-mcp-connect/PublicOpinionWorker-before-collection-recovery-20261020.xml`。四项API/采集/分析/翻译服务Running，API健康检查200。
- Chrome MCP返回Transport closed，CUA仅列出无页签MCP Apps。没有完成浏览器验收，以下均为真实数据库/服务证据。

## 真实恢复结果（截至北京时间11:19）

旧Last Light父任务已自动结束为partial，保留原失败子任务并汇总新增7条。新计划任务11:12自动入队，范围为北京时间10/19 00:00至10/20 11:12；三站点中两站完成（新增9、18条），另一站运行中（新增7条），合计新增34条。不是全部补采完成。

8个单站点源均已通过现役 `enqueueManualSourceSync` 的授权/配置检查按昨天00:00至提交时补采：Hero Clash、X-ヒーロー、X-HeroEA、히어로 클래시、マジックカード、TitanWarEA、TitanWarSA、주공을 지켜라。Hero Clash新增11、X-HeroEA新增7，正在运行；其余6个已持久入队，受现有3并发限制等待。未强制提高并发。入队X-ヒーロー曾死锁，重新按同一准入路径提交成功。

操作更正记录：最初误用旧enqueueSyncRun创建8条无窗口legacy收据；在任何一条执行前，均以状态/租约CAS将其取消（8条affectedRows=1，fetched/inserted均0），随后改用现役有界入口重建。没有删除记录或无界采集，原收据见 `collection-retry-replaced-legacy-receipts.json`。

## 全社区范围及例外

全表审计覆盖全部社区及关联来源（48条社区/来源关联行），16个启用源。除Last Light旧父任务外，未发现其他全部子任务终态却仍活跃的父任务。其新父任务queued时仍有正在运行的子任务，API列表会映射显示运行中，不能再当作孤立任务。

- 境内三个BigPlayer源与超能TapTap按计划执行；X-Clash今日计划已完成，没有同类阻塞。
- X-HeroSA源和账号均unconfigured，不能绕过授权采集。
- 当前可见目录中的HeroClashS、主公、走れ！、KingdomGo未配置采集源，不能将“有社区目录”当成“已启用采集”。未擅自补配置。
- Last Light Discord今日执行过，3357条抓取、1条新增，状态partial/DAILY_RUN_TIMEOUT；属于部分完成，并非没有触发调度。本轮未改Discord业务采集范围。
- マジックカード旧任务另有分页预算边界不完整记录；本轮仅修复站点误拦截，不宣称已解决所有分页范围问题。

原始和最终审计工件均位于 `.tests/2026-10/2026-10-20/collection-*.json`。修复后新增内容进入既有分析及推送链路；未手动补发历史消息，未改变既有通知日期过滤和去重。
