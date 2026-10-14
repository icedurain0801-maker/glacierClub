---
last_updated: 2026-09-10
status: completed_authorized_scope
scope: p0-last-night-controlled-collection
owner: 开发负责人
---

# v068 P0 Last Night BigPlayer 单来源受控真实采集

## 授权范围

- source：`081a16d2-5545-4afd-9c65-e04777e4540b`
- default account：`75c8205f-37eb-4bdf-b6a4-f4f502e35658`
- 北京时间窗口：`[2026-09-08 00:00:00, 2026-09-10 00:00:00)`
- UTC 窗口：`[2026-09-07T16:00:00.000Z, 2026-09-09T16:00:00.000Z)`

## 无竞争前置

数据库采样时间 `2026-09-10 10:40:53 +08:00`：

- source/account 均为 enabled、authorized，且绑定关系与批准范围一致。
- active sync run：0。
- active sync checkpoint：0。
- active analysis lease：0。
- 本机未发现该 source 或 `q1_crawler.py` 的活动采集进程。
- 当前数据库未安装 `po_source_schedule_state`，`po_sync_runs` 也没有统一调度字段；本次未执行迁移。

## 唯一一次采集结果

- 执行入口：当前工作树 `worker/src/worker.js` 的 `runSource`，直接使用修复后的 `BigPlayerH5Connector`；未使用会绕过连接器的 Python crawler。
- run：`76437a7a-8f49-4abf-85e0-88d090e2ea99`
- 终态：`completed_authorized_scope`
- 时间：`2026-09-10 10:42:32` 至 `2026-09-10 10:42:43`（数据库时间）
- discovered：107
- stored：87
- fetched：25
- inserted：25
- changed：0
- unchanged：0
- comments：46
- error：无

run 关联记录为帖子 25 条、评论 46 条，均为 inserted。`stored=87` 是分页写入处理计数，包含多 feed 重复处理；run 关联内容按 content 去重后为 71 条。

## DB 分日验收

按内容 `published_at` 与北京时间自然日窗口统计，排除已删除内容：

| 北京时间日期 | 帖子 | 评论 | 合计 |
|---|---:|---:|---:|
| 2026-09-08 | 15 | 16 | 31 |
| 2026-09-09 | 10 | 20 | 30 |
| 合计 | 25 | 36 | 61 |

run 的 `comments=46` 是本次抓取/关联计数；页面窗口按评论自身发布时间过滤后为 36，统计口径不同。

## API 与页面验收入口

本地 API 与用户侧 API 均返回 HTTP 200：

- `contents` total：61
- `contents/stats`：post 25、comment 36、negative 0、attention 2

用户页面：

`https://lfy3001.dev.q1op.com/admin/PublicOpinion/content.html?regionCode=overseas&gameId=00000000-0000-0000-0000-000000000002&communityId=00000000-0000-0000-0000-000000000102&sourceId=081a16d2-5545-4afd-9c65-e04777e4540b&platform=bigplayer_h5&publishedFrom=2026-09-08&publishedTo=2026-09-09`

## 边界与风险

- 未启动全局 Worker/调度，未操作其他来源、凭据或配置，未执行第二次采集，未 commit、push 或发版。
- 采集完成后的只读快照发现该 source 有 15 条 active analysis lease，由既有异步分析 Worker 处理；本次未启动、终止或干预该 Worker。
- 运行环境存在 `NODE_TLS_REJECT_UNAUTHORIZED=0` 警告，表示 TLS 证书校验被关闭；本次未改生产配置，需另行排查。
