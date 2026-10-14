---
last_updated: 2026-09-18
status: draft
scope: bigplayer_h5
owner: 开发负责人
---

# BigPlayer H5 多站点兼容设计

## 目标与边界

在不改变 TapTap/Discord 采集合同、不部署、不触发真实采集的前提下，使一个 `bigplayer_h5` 来源可配置 N 个站点，并保留旧 `baseUrl`、历史 run/checkpoint 与现有 scheduler source lease 语义。

## 兼容配置结构

canonical 配置增加 `siteUrls` 对象数组；旧配置只含 `baseUrl` 时读取阶段映射为 `siteUrls: [{ siteId: "legacy-<sha256(url)>" , url: baseUrl, enabled: true, authStatus: "unknown", capabilities: {} }]`。写入时保留 `baseUrl=siteUrls[0].url`，以兼容旧 API、Worker 与外部调用；新 API 返回二者，`siteUrls` 为权威字段。

每个 URL 独立执行 normalize、重复检查、协议/host/SSRF 白名单校验，并保存稳定 `siteId`、启用状态、授权状态、能力探测结果和最近错误。顺序由配置保持，`siteId` 由显式值优先、否则 URL 规范化值哈希派生。

迁移后的 `po_source_sites.site_id` 是持久化审计身份，业务运行优先读取该值；即使旧 `baseUrl` 含大小写或尾斜杠等非规范写法，也不得由运行时重新派生并覆盖已持久化的 siteId。迁移只为 NULL checkpoint.site_id 回填，不改已有站点身份。

## 运行与审计模型

- 一个父 run 对应 N 个站点子 run；父 run 仅汇总，不直接持有站点 checkpoint。
- `po_sync_runs.parent_run_id`（根父 run 为 NULL）、`po_sync_runs.site_id`；子 run 独立 lease/deadline、错误、计数和 checkpoint。
- 父状态：全部成功=`completed`；至少一个成功且至少一个失败=`partial`；全部失败=`failed`；仍有 queued/running 时保持进行中。
- 子 run 必须可由 `parent_run_id + site_id` 追溯；移除/禁用站点不删除历史子 run，in-flight 子 run 标记失败并保留审计。

## checkpoint 与并发

新增 `po_sync_checkpoints.site_id`，唯一键扩展为 `account_id,site_id,task_kind,task_key,sync_scope,root_platform_content_id,window_start,window_end`。同站点同窗口同 task/cursor/segment 重复 claim 拒绝；不同站点、窗口、segment 可并行。scheduler 周期 lease 仍按 `source_id`，不得拿 source 总锁阻断手动多站点子 run。

## 建议迁移

新增 `po_source_sites`（`id/site_id/source_id/url/url_hash/enabled/auth_status/capabilities_json/last_error/created_at/updated_at`，`UNIQUE(source_id,site_id)` 与 `UNIQUE(source_id,url_hash)`）；历史 source 从 `config.baseUrl` 回填一条 legacy site，不能改写历史 run/checkpoint。

为 `po_sync_runs` 增加可空 `parent_run_id`、`site_id` 及索引 `(parent_run_id,site_id)`；为 `po_sync_checkpoints` 增加可空 `site_id`，先回填 legacy siteId，再重建窗口唯一索引。旧 NULL/空值数据保留兼容读取，回滚仅移除新增索引/列，不删除历史数据。

## API/前端影响

来源列表/详情返回 `siteUrls` 和逐站点状态；授权/能力探测必须带 `siteId`；手动同步返回父 run 与子 run 状态。BigPlayer 表单支持站点增删、逐项校验/授权/能力/最近同步/错误；同步进度展示父汇总与子项。

## 受控验证

只使用三站点 fixture：一站成功、一站失败、一站在运行中被移除。覆盖 normalize/duplicate、父状态聚合、credential 归属、旧 baseUrl 迁移与 API/页面兼容；仅单测、静态检查和 migration contract，不写真实库、不部署、不启动真实采集。
