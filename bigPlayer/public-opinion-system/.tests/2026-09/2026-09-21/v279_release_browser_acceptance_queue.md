# 未完成任务最小浏览器验收队列

- 更新日期：2026-09-21
- 维护角色：测试负责人
- 范围：只准备验收用例、样本、API/浏览器入口与关闭条件；不启动同步、不改代码、不发版。
- 通用规则：每个最小修复一完成即执行 API/数据与真实浏览器快速验收。未提供 `runId`、样本和独立浏览器记录一律退回；子项 PASS 不代表总任务关闭。

## 当前队列

| 优先级 | 任务 | 当前状态 | 进入实测的前置条件 |
|---|---|---|---|
| P0 | TapTap manual run 被 Worker 实认领 | 等待开发 | 异常 BigPlayer run 状态收口并完成精确清理；开发负责人提供新的 TapTap `runId`。已有受控切换和单次 run 执行授权，不等待新的发版确认。 |
| P0 | BigPlayer 评论 A/B 与近七天窗口 | 等待开发 | 提供覆盖境内全 `bigplayer_h5` 的候选、明确的 A/B 帖子样本及 API/Worker 定向测试结果。 |
| P1 | 最终 severity 规则与历史回算 | 等待开发 | 提供实现候选、回算批次/审计模型、样本回算结果及不通知合同测试。 |
| P1 | TapTap incremental cursor | 可立即测（隔离）；真实运行待具体方案 | 隔离合同已有证据；如需真实运行，由项目经理先根据具体 run/window/环境方案判定，再提供对应 runId 和观察入口，不作笼统发版等待。 |
| P1 | BigPlayer 多站点 | 等待开发 | 补齐父 run 对 scheduled_site 子 run 的 pause/cancel 传播与聚合保护，随后提供 API/Worker/UI 候选。 |
| 发布前 | 口碑趋势 | 可立即测 | 当前 3000 免登录只读入口可做基线复核；真正发版前须在待发候选上重新执行。 |

## 1. TapTap Manual Run 被 Worker 实认领

### 样本与入口

- 必填样本：一个新建的 TapTap `manual/queued` run，记录 `runId`、source/account、创建时间；同时保留一个可观测的长扫描 run。
- API：`GET /api/public-opinion/sync-runs/{runId}`、`GET /api/public-opinion/sync-runs/{runId}/contents`，以及只读 checkpoint/run 查询。
- 浏览器：`http://127.0.0.1:3000/admin/PublicOpinion/collection-runs.html` 与对应内容页深链。

### 最小验收

1. 长扫描仍在进行时创建的 manual run 在轮询间隔内被 claim，记录 lease owner/epoch、开始时间和终态。
2. run 的内容、checkpoint 和 collection evidence 与 API 一致；非 manual 的新增 scheduled run 未被该轮询器提前执行。
3. 浏览器任务记录显示同一 `runId` 的执行进度与终态，内容页能定位受控样本。
4. 轮询结束后无继续轮询证据；重复观测不产生重复 run 或重复内容。

### 关闭条件

异常 BigPlayer run `1c252178-604a-4381-98aa-129bdd0a9ca2` 完成状态收口和精确清理、开发负责人提供新的 TapTap `runId` 后，补齐 `runId`、样本、API/数据库、Worker 日志和独立浏览器记录。v055 隔离 PASS 报告 [v278_v055_taptap_manual_queue_poll_candidate_qa.md](v278_v055_taptap_manual_queue_poll_candidate_qa.md) 仅为前置证据，不可关闭本项。

## 2. BigPlayer 评论 A/B 与近七天窗口

### 样本与入口

- A 样本：post `920098`，平台声明评论数 `1`，当前无对应入库评论。
- B 样本：开发交付时提供一条近七天内、至少含一条评论回复的跨社区/站点帖子 ID；不得用 A 的同一帖子替代。
- API：来源详情、sync run 详情/contents、内容树与内容列表；浏览器入口为 `sources.html`、`collection-runs.html`、`content.html`。
- 时间窗口：以执行当刻北京时间近七天 `[今天-6 天 00:00, 当前时刻]` 固化在报告，所有 API 与页面使用同一 `publishedFrom/publishedTo`。

### 最小验收

1. A 的顶层评论真实入库，详情可见正文；本地有效顶层评论数与声明数按同一口径核对。
2. B 的顶层评论与回复均入库，分别校验 `root_content_id`、`parent_content_id`、`content_depth=1/2` 和平台外部 ID。
3. 近七天窗口的手动与定时 run 均有 comments/replies checkpoint、进度与真实 `comment_count`，不得用帖子 engagement 声明数冒充。
4. 声明数大于本地数而接口空返回、授权/分页/结构/父子解析失败时，run 为 `partial/failed`，有稳定错误码与可重试 checkpoint，绝不为 success 0。
5. 新增或变化的评论/回复各投递一次 AI 分析；历史缺口补抓不调用通知 adapter/outbox。
6. 重复抓取和缺口扫描二次执行无重复内容、分析任务、告警或统计。

### 关闭条件

至少两个境内 BigPlayer 社区/站点完成 A/B 浏览器抽样；全量启用国内 `bigplayer_h5` 有参数化 API/Worker 契约；所有 runId、样本、近七天窗口和浏览器记录入报告。

## 3. 最终 Severity 规则与历史回算

### 范围

仅限 `public-opinion-system` 的最终 `severity`：新分析、重分析、历史全量回算、内容管理、概览和当前告警。抓取、翻译、评论采集不属于本项改动或回归范围。

### 样本与入口

- 必测：`919167`、`919098`，均期望 `urgent`。
- 控制样本：普通 `negative + normal`、正面含游戏问题词、`positive + attention/urgent`、无明确风险证据的 `neutral + attention`、负面父帖下的中性评论。
- 异常基线：近七天 `urgent=1, attention=631`，报告须说明回算前后变化，不得以互动量作为分层依据。
- API：内容列表/统计、概览、告警列表与详情、回算批次审计查询。
- 浏览器：`content.html?riskMode=negative`、`content.html?riskMode=attention`、`index.html`、`alerts.html`。

### 最小验收

1. 全部 `negative` 至少为 `attention`；玩法/功能 Bug、奖励数值、活动、登录账号、付费资产、网络服务稳定、外挂安全、无法使用或实际体验影响的负面直接 `urgent`；`919167`、`919098` 回算后均为 `urgent`。
2. 一般负面才为 `attention`；`positive` 强制 `normal`，不进入关注级、负面待处理或当前告警；正面攻略含“闪退解决方法”不升级。
3. `attention` 与 `urgent` 集合无交集，`riskMode=attention/negative` 分别精确映射最终 `attention/urgent`；所有平台、境内外、帖子/动态/评论/回复参数化覆盖。
4. 概览、内容管理和当前告警的列表、统计与详情使用同一最终 severity；重新分析不得降级已升级等级或重复开告警。
5. 历史全量回算包含已删除内容，按内容 ID 分批、可续跑、二次执行幂等；保留原始等级、最终等级、原因与批次审计。正面历史未闭环告警转 `false_positive`；历史回算前后通知/outbox 数量不变。

### 关闭条件

以上样本的 API/数据断言与浏览器四页核对完成，回算批次 ID、前后数量、审计、告警状态和独立浏览器记录齐全。

## 4. TapTap Incremental Cursor

### 样本与入口

- 样本：一个 `owned_content/incremental` checkpoint，首轮页预算耗尽后持有非空 cursor，例如 `{"version":1,"accountIdx":0,"from":200}`。
- API：run/checkpoint 只读详情与对应内容列表。
- 浏览器：`collection-runs.html`、`content.html`，记录同一 source/account 与两轮 runId。

### 最小验收

1. 首轮结束为可续跑状态，保存安全 cursor；第二轮第一个 connector 请求使用该 cursor，不能从首页归零。
2. 两轮累计内容无重复新增；回填、其他平台增量和 TapTap 评论 checkpoint 不受影响。
3. 浏览器任务记录显示两轮 run 的 cursor/状态/计数与 API 相同，内容列表不虚增。
4. Provider 返回 HTML、无效响应或租约失败时保留上一个安全 cursor，终态 `partial/failed`，不虚报成功。

### 关闭条件

真实或经项目经理按具体 run/window/环境方案判定的受控两轮 runId、请求 cursor 证据、checkpoint、唯一内容计数和浏览器记录齐全。已有隔离 fixture PASS 不代替本项。

## 5. BigPlayer 多站点

### 样本与入口

- 样本：一个具有至少两个启用 `siteUrls`、持久 registry 一致的 BigPlayer source，记录 sourceId、siteId 列表与父/子 runId。
- API：source 详情、sync run 列表/详情、child contents 与 site-scoped checkpoints。
- 浏览器：`sources.html` 管理抽屉、`collection-runs.html` 父/子投影与控制、`content.html` 的站点来源结果。

### 最小验收

1. 手动与定时各生成一个父 run 和每个启用站点一个子 run；子 run 使用自身 site URL，checkpoint 在 siteId 维度隔离。
2. 父汇总的 `siteTotal/siteTerminal/siteSucceeded/siteFailed` 与所有子 run 终态、计数、错误一致；页面不把单一子 run 误展示为来源整体成功。
3. 父 pause/cancel 传播至 queued/running `scheduled_site` 子 run；子项结束时不得覆盖已 paused/cancelled 的父终态。
4. registry/config 不一致或 siteId 缺失时 fail-closed，不回退首站；UI 显示可诊断错误。
5. 站点之间无 cursor、内容或计数串用，重复执行不重复创建 child run/checkpoint/content。

### 关闭条件

补齐 parent-control 缺口后，手动/定时各有真实父子 runId、两站点样本、API/数据库与独立浏览器记录；仅仓储或 mock PASS 不可关闭。

## 6. 口碑趋势发布前复核

### 样本与入口

- API：概览趋势接口，固定一个当前有 `positive/negative/neutral` 三类数据的区域、社区、平台和日期窗口。
- 浏览器：`http://127.0.0.1:3000/admin/PublicOpinion/index.html`；桌面与 `375x667` 两种视口。

### 最小验收

1. 图例、摘要与每日趋势同时展示正向、负面、中性；三类和 total 相符，`unclassified` 不被算作中性。
2. 仅中性、某类为零、切换时间范围、区域/社区/平台时，比例、柱位置、日期对齐和 API 数据一致。
3. 桌面与 375px 无重叠、截断、伪柱或错误色彩；深链保留筛选参数。
4. 回归概览卡片、风险链接、内容列表跳转与现有口碑趋势不串范围。

### 关闭条件

候选版本的只读 API 响应、桌面和 375px 独立浏览器截图/记录齐全。历史 v026 PASS 仅为基线，发布前必须重测。

## 调度规则

- `可立即测`：测试负责人可只读执行，完成后即时向项目经理回执。
- `等待开发`：只接收候选、定向测试、样本与变更说明；未齐全即退回开发负责人。
- `等待用户发版确认`：仅用于确实需要新的 Worker/API 切换或发版决定的项目；已有受控切换和单次 run 授权的任务不得套用此状态。
