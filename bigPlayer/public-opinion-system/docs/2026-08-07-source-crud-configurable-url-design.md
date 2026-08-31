# 采集源 CRUD + 可配置社区链接 — 设计文档

日期：2026-08-07
状态：待评审

## 1. 背景与问题

当前采集源页（`admin/PublicOpinion/sources.html`）只有一个「大玩家H5社区」源，且只能「配置」（改频率/凭据），**不能新增、不能删除**。

更关键的是：H5 连接器（`bigPlayerH5Connector.js`）的**采集地址来自环境变量** `BIGPLAYER_H5_BASE_URL`，连接器是单例，完全忽略传入的 `source` 对象。`po_sources.config` JSON 列（现存 `{"board":"目标板块"}`）目前不参与 URL。因此"多个可配置链接的采集源"不仅是 UI 改动，必须把 URL 从 env 下沉到每源 config，并让连接器按 source 读地址。

## 2. 目标

1. 采集源支持新增 / 编辑 / 删除（全平台通用 CRUD）。
2. 大玩家社区地址（baseUrl + 起始路径）可在后台按源独立配置为链接。
3. 保持现有安全模型：fail-closed + 白名单校验，不引入 SSRF 缺口。

## 3. 决策（已与用户确认）

| 决策点 | 选择 |
|--------|------|
| CRUD 范围 | 全平台通用 CRUD（选平台+游戏+地址+频率） |
| URL 安全边界 | 可填链接 + 服务端白名单校验（host 必须 ∈ env 白名单；内网/localhost 拒绝） |
| 每源配置粒度 | config 存 `baseUrl` + `startPaths`；白名单/cookie/深度等仍留 env（运维控） |
| 删除方式 | 软删除（config 打 `deleted:true`，历史内容/分析/告警保留可追溯，零 migration） |

## 4. 分层设计

### 4.1 数据层（不改表结构，零 migration）

复用 `po_sources.config` JSON：`{ baseUrl, startPaths: [], board, deleted? }`。
- `baseUrl` — 该源采集起点，如 `https://community.q1.com`
- `startPaths` — BFS 起始路径数组，默认 `['/']`
- `deleted` — 软删除标记，`true` 时列表与调度均忽略

白名单（allowedHosts）、cookie/bearer、maxDepth/maxPages/delayMs 仍留 env — 属运维配置，不下放页面。

### 4.2 连接器改造（核心）

`BigPlayerH5Connector` 从"读 env 单地址"改为"按传入 source 读地址"：

- `healthCheck(source)`：
  `baseUrl = source?.config?.baseUrl`；
  `configured = enabled && baseUrl && (cookie || bearer) && hostAllowed(baseUrl)`
- `collect({ source })`：`baseUrl` / `startPaths` 从 `source.config` 取；BFS 逻辑与 `sameHost`（对 env 白名单校验）不变。
- `app.js` check-auth 分支：`healthCheck()` → `healthCheck(source)`。

**fail-closed 兜底不破坏**：source 无 baseUrl，或 host 不在白名单 → `configured:false` → 授权失效 → 绝不采集、绝不伪造。env 里的 `BIGPLAYER_H5_BASE_URL` 保留为可选默认值（source.config.baseUrl 缺省时回退），但白名单校验始终生效。

### 4.3 API（server/src/app.js）

**新增 `POST /sources`**
body：`{ gameId, platform, sourceType, displayName, baseUrl, startPaths[], frequencySeconds, activeWindow? }`
- 服务端白名单校验：baseUrl 必须为 http(s) 且 `new URL(baseUrl).host ∈ env 白名单`，否则 `400 URL_OUTSIDE_ALLOWED_HOSTS`（内网/localhost 天然拦下）。
- `enabled` 默认 0（新增后需配凭据+检测授权才启用）。
- `config = { baseUrl, startPaths, board }` 写入。

**新增 `DELETE /sources/:id`（软删除）**
- 将 `config.deleted = true` 写回；不物理删除任何行。
- 返回 `{ deleted: true, id }`。

**扩展 `PATCH /sources/:id`**
- 新增可改字段 `baseUrl` / `startPaths`（写回 config），同样过白名单校验。
- 复用现有 enabled/frequency/activeWindow/displayName 逻辑。

**白名单校验抽成公共函数** `assertHostAllowed(baseUrl)`，POST 与 PATCH 共用，避免两处漂移。

### 4.4 Repository 改造

- `listSources` / `listDueSources` / `listManualDueSources`：SQL 加 `AND (JSON_EXTRACT(config,'$.deleted') IS NULL OR JSON_EXTRACT(config,'$.deleted') <> true)`，软删除源不再出现在列表，也不再被 worker 调度/手动采集。
- 新增 `createSource(payload)`：INSERT po_sources，config 写 baseUrl/startPaths/board。
- 新增 `softDeleteSource(id)`：读 config → 合并 `deleted:true` → UPDATE。
- 扩展 `updateSource`：支持 config 内 baseUrl/startPaths 的合并更新（读-改-写，保留 board 等其它键）。

### 4.5 前端（sources.html + assets/sources.js）

**列表页**：
- 右上角加「+ 新增采集源」按钮。
- 每行「操作」列：现有「配置」+ 新增「删除」（红色，二次确认）。
- 空态文案改为引导点新增（去掉"先在 po_sources 表灌入数据"）。

**新增弹窗**（复用 drawer 样式）：
游戏下拉 + 平台下拉 + 采集源名称 + **社区地址 baseUrl**（链接输入）+ 起始路径（逗号分隔，默认 `/`）+ 采集频率。
地址框下灰字提示"仅允许白名单内域名，内网/localhost 会被拒绝"。保存走 `POST /sources`，白名单报错原样 toast。

**配置 drawer**：加「社区地址」块（baseUrl + startPaths，可编辑，走 PATCH）。非大玩家H5平台（连接器是桩）隐藏地址块并标注"该平台连接器待接入"。

**删除交互**：点删除 → confirm 二次确认 → `DELETE /sources/:id` → toast + 刷新。

## 5. 安全与迁移友好性

- **SSRF 防线**：唯一可信边界是 env 白名单，页面输入的 baseUrl 必须过 `assertHostAllowed`；localhost/内网非白名单则拒。白名单本身只有运维能改 env，页面改不了。
- **fail-closed 不变**：未授权/无 baseUrl/host 越界 → 不采集，绝不伪造数据。
- **凭据不变**：仍走 po_credentials AES-256-GCM 加密，页面永不回显明文。
- **零 migration**：全部复用 config JSON，交接时不需要跑新 SQL。
- **po_ 前缀隔离**：不触碰 aiCompanion 业务表。

## 6. 测试

- 连接器：`healthCheck(source)` 对 有/无 baseUrl、白名单内/外 host 的 configured 判定；`collect` 用 source.config 而非 env。
- API：POST 白名单内通过 / 内网 URL 被拒 400；DELETE 后 listSources 不含该源、po_contents 行仍在；PATCH 改 baseUrl 白名单校验。
- Repository：软删除源不出现在 listDueSources/listManualDueSources。
- 复用现有 `server/test/*.test.js` 结构补测。

## 7. 不做（YAGNI）

- 不做非 H5 平台的真实连接器（仍是桩，选了也抓不到）。
- 不做白名单的页面管理（运维 env 控）。
- 不做删除回收站/恢复 UI（软删除标记已保留数据，需要时后续再加）。
