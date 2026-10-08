---
status: confirmed-defect
scope: BigPlayer H5 多站点采集
reported_at: 2026-09-20
---

# BigPlayer 多站点配置未完整进入抓取执行链路

## 一句话结论

采集源页面可以保存 3 个站点地址，但当前运行链路仍以第一条 `baseUrl` 为唯一连接器上下文；因此用户感觉“只抓到其中一个”不是单纯的视觉错觉，至少存在高概率的真实单站点执行缺陷。

## 已确认事实

- 前端和接口已支持逐行保存 `siteUrls`，并把第一条同步到兼容字段 `baseUrl`。
- `server/src/services/bigplayerSiteConfig.js` 已有站点规范化、去重、`siteId` 生成逻辑。
- `migrations/027_bigplayer_multisite.sql` 已预留 `po_source_sites`、`po_sync_runs.parent_run_id/site_id`、`po_sync_checkpoints.site_id`。
- `server/src/services/bigplayerMultiSiteRuns.js` 只有子 run 定义和父状态聚合辅助函数，目前未接入 Worker 实际执行入口。
- `worker/src/worker.js` 的 `runSource`、`runPagedSource`、`syncStage` 均接收单个 `source`，未发现读取 `config.siteUrls` 或按 `siteId` 循环执行。
- `server/src/connectors/bigPlayerH5Connector.js` 的 `resolveBaseUrl`、`q1Context`、`discoverFeeds`、`listFeedContents` 均从单一 `config.baseUrl` 建立请求上下文。
- `server/src/db/repository.js` 的同步任务创建、领取和查询仍以单个 source/account run 为主。

### 用户现场样本（2026-09-21 补充）

- 证据截图：`C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-2c10dc82-60ab-4bfe-9336-09a376b8a75a.png`。
- 配置抽屉可见 3 个逐行站点输入框；当前截图中三行可见前缀相同，末尾被输入框截断，不能仅凭截图证明它们是三个不同 URL。
- 左侧采集源汇总只显示帖子“失败 / 25,534 已写入”、评论（含评论内回复）“已完成 / 12,608 已写入”，没有按站点拆分的 run、请求、入库或失败明细。
- 因此当前 UI 既不能证明 3 个站点都执行，也不能证明只执行了一个；验收必须以保存后的规范化 `siteUrls`、父/子 run、`site_id` checkpoint 和每站请求日志为准，禁止用源级汇总状态代替站点级证据。

## 需求与修复口径

1. BigPlayer 所有社区类型统一按 `siteUrls` 执行，不以 X-Clash 或某一个社区特判。
2. 每个启用站点必须生成独立子任务/子 run，并带独立 `siteId`、checkpoint、游标、授权/能力状态、错误信息和抓取计数。
3. 父 run 汇总全部子 run 的结果：全部成功为成功，部分成功为部分成功，全部失败为失败；一个站点失败不得阻断其他站点。
4. 手动“开始同步”、定时同步、补跑、恢复任务都必须遍历全部启用站点。
5. 每个站点的 Q1 请求上下文必须从该站点 URL 解析 `gameId`、`gameVersion`、`env`、`lang`，不得继续复用首站参数。
6. 内容去重与 checkpoint 必须保留 `siteId` 维度，避免三个站点互相覆盖游标，也避免一个站点的空结果覆盖其他站点结果。
7. 前端同步进度展示站点级进度，至少可看到每个站点的状态、发现数、入库数、失败原因和最后请求时间；总进度为所有站点汇总。
8. 配置保存后的响应、数据库配置、运行时创建的子 run 数量必须可核对，不能只返回首站兼容字段让用户误以为全部已生效。

## 验收场景

- 配置 3 个不同的 BigPlayer H5 地址并保存，接口返回 3 个规范化站点，数据库 `po_source_sites` 为 3 条启用记录。
- 点击“开始同步”：产生 1 个父 run + 3 个子 run，3 个子 run 的 `site_id` 各不相同。
- 运行记录中能看到 3 组 checkpoint/游标；任一站点失败时，其他 2 个仍继续抓取并入库。
- 3 个站点的请求日志分别包含各自 URL 中的 `gameId`、`gameVersion`、`env`、`lang`。
- 定时同步和补跑重复验证上述行为，不能只在手动同步路径生效。
- 兼容只有一个 `baseUrl` 的旧采集源：自动生成一个 legacy site，不改变历史数据和既有单站点行为。

### 产品验收边界

1. “配置了 3 个链接”只代表 3 个有效、非重复且已启用的 `siteUrls`；若三行规范化后是同一 URL，保存应按重复地址规则拒绝，不能计作 3 个站点。
2. 父 Run 成功或源级总写入量非零不等于多站点成功；必须能逐站查看 `siteId`、URL、状态、发现/写入/评论计数、错误码和最后请求时间。
3. 1 个站点失败、2 个站点成功时，总状态只能是部分成功；失败站点的错误不能被首站或父汇总覆盖。
4. 3 个站点返回相同外部内容时，按站点身份保留可追溯关联；同一站点重复分页必须幂等，不得因跨站点共用游标漏抓或覆盖。
5. 保存、手动同步、定时同步、补跑和恢复均必须使用相同的站点枚举结果；不得只在手动路径实现多站点。
6. 本次多站点验收不包含 API 正式发布、Windows 服务重启、数据库迁移执行、平台授权修复或评论算法调整；这些事项按各自任务单独验收。

## 交接依据

- 配置保存：`admin/PublicOpinion/assets/sources.js`、`server/src/app.js`
- 连接器：`server/src/connectors/bigPlayerH5Connector.js`
- Worker：`worker/src/worker.js`、`worker/src/dailyRunner.js`
- 运行仓储：`server/src/db/repository.js`
- 多站点迁移/辅助：`migrations/027_bigplayer_multisite.sql`、`server/src/services/bigplayerMultiSiteRuns.js`
