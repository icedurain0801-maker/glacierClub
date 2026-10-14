# 海外补采执行与 partial 诊断

Status: LIVE_PARTIAL / RECOVERY_NOT_EXECUTED / AI_INCOMPLETE
Date: 2026-10-09

## 已确认现场

本记录接续 v019，旧 queued 快照不是当前状态。项目经理串行只读确认 PID 19584 入口为 `C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1/worker/src/worker.js`；candidate-staging 只是日志输出目录。

- 父 `f49d0d58-926d-4352-8186-f75a0fc4e721`；子 language9 `607bafc0-941a-43df-aa45-308c95647f6b`、language2 `5fd578a1-91a5-4fd0-a3a3-2b7f3aed8ae5`、language16 `4da86327-92b9-4627-9565-65e985c2f6d9`。
- 三子数据库 UTC 03:09:34 已领取。UTC 03:11:51 快照：language2 已 partial，03:10:28 结束，PARTIAL_SYNC；另两子 running，父 queued。后续状态待经理提供，不把快照当永久状态。
- 窗口为 UTC `2026-10-02 03:07:34.810` 至 `2026-10-09 03:07:34.810`，是七天 catchup，不是指定一天完整采集。
- language2 stored_count=335 是累计计数；run 关联去重后 101 posts + 171 comments = 272 唯一内容，不能称 335 唯一帖子。
- 本次 q1_feed checkpoint 最新记录本地 11:09:56：failed / ER_LOCK_DEADLOCK。旧 09/20 lease lost 不混算本次错误。
- 本批关联 light jobs completed=10、pending=262；现行 content fingerprint 匹配的 light analyses=10；deep pending=1。真实 AI 全集未完成。

UTC 03:13:00 更新（不混用前一时刻）：两子仍 running、计数 0；272 唯一内容排序 ID+fingerprint manifest SHA256 为 `dfbd05b7b0783d1b5eb86d432bb439313e1e68fa4af5545dec43dab01df1d9fc`。失败 posts task_key 为 `100017:circle:activity:552:564:5::1`、ER_LOCK_DEADLOCK，其他 posts checkpoint completed。sentiment-v1 light completed=20、pending=252，deep pending=5，动态统计不能代表全集完成。经理脱敏快照位于根 `.temp/bigplayer-recovery-20261009/lastnight-runtime-60JPM6/live-catchup-readonly-031300.json`。

UTC 03:14:36.555 更新：language9/16 两子 account 相同，均 running / SYNC_RUN_RECOVERED，新 claim owner 已变化，lease 分别至 03:19:34 / 03:19:36。language9 新建 8 个 checkpoints，最新本地 11:14:36；language16 尚无 checkpoint。至少 language9 在回收后已有真实检查点活动，不能推定永久假 running，也不能把其检查点活动外推为 language16 已抓取或任一站完整完成。legacy2 仍 partial、累计 stored335。source lease epoch1534、owner 不变，until03:12:34.810 已过期，next06:00、父 queued；过期 source lease 不等于 active-run 门禁解除。

## 只读代码结论

现役 worker.js:1298 在 scheduler 之前取队列，1315 才调度，1360 轮询只接 manual。新 scheduled 子最早下一 scan 消费，现场已证明下一 scan 领取。日志 queued1 是初始 runnable 队列加轮询计数，不是 scheduler 本轮创建数量；撤销“永久只入队不消费”推测。repository.js:1186 排除有子任务的父，父不直接执行是设计行为。

现役支持七天有界窗口和无 board 列的 legacy 内容写入，但不继承受控候选的安全放行：Connector 有 401/403 自动刷新可达路径、遍历 context boards 的路径；legacy Store 未具受控 before/after 范围保护和认证恢复证据。未证明这些风险已在现场触发，不能把代码可达性当实际发生。

ER_LOCK_DEADLOCK 已证实，但争用双方和锁顺序仍待确认。同账号 advisory lock 位于 claim 之后，因此多个 running 不证明多个账号采集同时执行；每 run commitLane 串行也不排除 checkpoint、AI 或其他事务竞争。不能仅凭三个 running 断言三站并行 upsert 是根因。

进一步只读核：worker.js:962-967 拿账号锁失败直接返回 `{skipped:true,reason:'account_locked'}`；runSource 直接返回 runPagedSource 结果，finally 仅停止 leaseGuard，不调用 finishOnce。因而存在“已 claim，但未采集，running 留到 lease 到期”的代码路径；另两子是否走该路径待现场 account/检查点时间/进展证据确认。技术核查补充现役 upsert 已有四次 deadlock 重试和按 externalId 排序，不能把缺重试作为已证实根因。

## 决策与剩余工作

1. 暂停精准取消方案：四条 queued/started=NULL 的前提已失效。未执行取消、恢复、第二次 Store 或重抓。
2. 60JPM6 源码继续冻结；国内 Worker、共享服务、健康调度和算法不改、不停、不重启。
3. 项目经理串行只读等待另两子终态，保存实际窗口、run/checkpoint、分页完整性及内容完整性诊断，核 account 是否一致和 source lease owner/epoch；不并发现场 IO。
4. 若需根因证据，只读取与本次时间匹配的死锁表/索引/锁方向脱敏摘要，不公开 SQL 参数、正文或凭据，不冒认旧 LATEST DEADLOCK。
5. 终态后再按安全 cursor、精确 contentId/fingerprint 集合设计仅海外恢复，交独立 QA；未通过前不启动第二入口。完整日、持久 slot、02:00 入口及 AI 全集仍未验收。

本次仅只读分析与诊断记录，无业务代码变更；未执行现场 DB/外部请求。现役顶层 loadRuntimeEnv 有环境读取副作用，本次未直接导入或执行 shared Worker 做离线测试。

## language9 终态及后续只读准备

经理 UTC03:15:50 快照：language9 子 completed_authorized_scope，finished03:14:45，stored164、fetched101，124 checkpoints 均 completed；该站不重抓。language16 仍 running0、lease03:19:34、无 checkpoint；legacy2 partial 不变，父 queued。authorized_scope 不等于完整一天 PASS。

独立 QA v023 核 UTC03:13:50.799 动态关联快照：272 唯一 contents；164 唯一 memberships 覆盖全部101 posts；277 jobs 引用272内容，其中 light272=completed20/pending242/running10，deep5 pending；20 analyses 的当前指纹、version/profile/job 全匹配。该结果只证明部分关系与20个精确完成，不能与其他时刻 pending 数混合，也不证明 AI 全集完成。

后续仅准备，不改现役或冻结依赖：

- 恢复：待 language16 终态/再回收证据后，绑定 legacy2 失败 task、site/account、原七天窗口、安全 cursor 和 run/checkpoint owner/epoch；已完成的 language9 不重抓，已完成 task 不整体重置。现役产出的内容不具 ProtectedStore journal，禁止套用候选正文回退；死锁争用与游标完整性仍待证实。
- legacy slot：`lastNightDailySlot.js` / `lastNightWriteSchema.js` 的 daily 合同要求现役缺失的 board/community/site_url_snapshot 等列，不能直接运行或以空值假兼容。后续独立适配只使用已实证列及 `(source_id,scheduled_at)` 唯一索引；缺失的业务范围/配置原文绑定需由认证计划与证据保护，不 DDL。
- 单一入口：`lastNightOverseasDailyJob.js` main 加载 shared Worker，禁止直接接 cmd。仅调 next_scheduled_at 不证明每日02、窗口正确或单一 owner；需先核现役 frequency/effective/version/last/next 与已有入口，再设计源级 lease fencing、active-run 门禁与失锁停止。不得为抢 owner 停共享 Worker。
- 时间合同：若下一 slot 为上海 `2026-10-10 02:00`，数据库 UTC 为 `2026-10-09 18:00`，前一自然日窗口 UTC `2026-10-08 16:00` 至 `2026-10-09 16:00`。`scheduleSlots.js` 已有02与前一自然日计算；实际 source 配置和唯一入口待确认，不沿用七天 catchup 窗口。
- 候选负例：重复 slot/不同 owner、active run、过期/变更 epoch、配置或 site 原文变更、UTC/上海误解、窗口被 checkpoint 缩窄、cursor 不前进、部分 AI 完成、COMMIT 未知、恢复只覆盖失败 task。以上尚未实施或运行测试，终态证据后才收口执行方案。

版本边界已复核：现役 release `sourceScheduler.js:139` 的 computeSchedule 根据 frequency/effective/lastProcessed 计算 due，不使用 next_scheduled_at，因此只改 next 字段无法改变实际 due 合同。现役 `boundedWindowFor:79` 原样保留02的自然日 window；工作树新版另有 windowEnd 扩到 now 的分支，不混称现役行为。有限 source lease 仅暂时互斥，过期后共享 scheduler 可再次竞争，不能据此宣称独立周期入口已唯一；长期 owner/目标源路由接管仍需单独证明，不能以延长租约代替正式交接。

## UTC03:17:52 范围与调度实证

经理只读证据：根60JPM6/live-catchup-scope-schedule.json。language2/9 各关联272唯一内容，是同源复用的同一集合，不能相加544；published_at NULL=0，原七天窗口内272、窗口外0。101 posts 顶层 integrity/board 字段 unknown，不据此称 enriched 或每条 board 已证实。

真实 frequency_seconds=21600（6小时），source/state schedule_version=1，effective=`2026-09-11 08:35:49.524`，last_scheduled UTC10/9 00、next06；source lease epoch1534 原owner、until03:12:34.810。Windows 仅找到 `BigPlayer Last Night Overseas Daily02 Ready` 任务，既有缺入口文件问题未修。6小时现役调度与缺入口的02任务并存，不代表每日02单一owner。language16 仍 running、lease至03:19:34、无run关联；后续状态待确认。

现役 raw 路径只读定位：connector q1SafeRawPost/q1Post 生成 rawPayload._contentIntegrity 并返回 boardId；worker.js:99-108 normalizePlatformItem 重新构造 rawPayload，仅原type为0/1时保留 `{type}`，否则NULL；syncStagePage 把此归一化输入交 Repository。因此 integrity/board 可在写入前被丢弃，不是必然藏在另一嵌套路径。已请求经理只聚合 raw JSON 类型与键名验证，不输出值或正文；尚未取得该现场键集合结果。fingerprint/AI匹配只能证明现行版本关联，不能证明详情完整。membership board 前缀和source配置只作独立范围旁证，不能冒充原内容 board 字段。

本阶段仍只读规划，未修改现役或冻结执行依赖，未创建02任务、未更改frequency/next/owner、未重抓已完成language9。下一步先收口language16及raw键集合，再决定失败task恢复和单一日owner方案；不直接运行新schema slot模块。
