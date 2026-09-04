# 变更记录：采集源增删改 + 大玩家社区地址可配置

- 日期：2026-08-07
- 设计文档：`docs/2026-08-07-source-crud-configurable-url-design.md`

## 背景

采集源与授权页此前只有一个硬编码的「大玩家 H5 社区」，社区地址完全从环境变量读取，页面无法新增/删除采集源，也无法为不同社区配置不同的抓取地址。本次实现全平台通用的采集源增删改，并让大玩家 H5 的抓取地址支持在后台按源配置链接。

## 改动清单

### 连接器（`server/src/connectors/bigPlayerH5Connector.js`）
- 新增 `parseSourceConfig(source)`：从 `source.config`（JSON 字符串或对象）安全解析 `{ baseUrl, startPaths }`。
- `healthCheck(source)` / `collect({ source })` 改为按源读取 `baseUrl`（缺省回退 env 默认值），不再当单例读全局。
- 新增 `hostAllowed(url)` / `resolveBaseUrl(source)`；env 白名单（`BIGPLAYER_H5_ALLOWED_HOSTS`）仍是唯一可信边界。
- 导出 `parseSourceConfig` 供测试与前后端复用。
- `worker/src/worker.js`：授权闸门改为 `connector.healthCheck(source)`，让每个源用自己的地址判定授权。

### 数据层（`server/src/db/repository.js`）
- 软删除过滤片段 `NOT_DELETED`：`config.deleted=true` 的源自动从 `listSources`/`listDueSources`/`listManualDueSources` 中隐去。
- `createSource(...)`：`config` 写 `{ baseUrl, startPaths, board? }`，`enabled` 默认 0（需配凭据 + 检测授权后才启用）。
- `softDeleteSource(id)`：`config` 合并 `deleted:true`、`enabled=0`，不物理删除，历史内容/分析/告警全部保留。
- `updateSource(...)`：新增 `baseUrl`/`startPaths` 支持，只在传入时读旧 config 合并回写。

### API（`server/src/app.js`）
- `POST /sources`：校验 gameId/platform/displayName；`validateBaseUrl` 过 SSRF 白名单（内网/localhost/非白名单域返回 400 `URL_OUTSIDE_ALLOWED_HOSTS`）；成功返回 201。
- `DELETE /sources/:id`：软删除，返回 `{ deleted:true, id }`，不存在返回 404。
- `PATCH /sources/:id`：扩展 `baseUrl`（走白名单校验）与 `startPaths`。
- OPTIONS 允许方法补 `DELETE`。

### 前端（`admin/PublicOpinion/sources.html` + `assets/sources.js`）
- 顶栏新增「+ 新增采集源」按钮与弹窗（游戏/平台/名称/地址/起始路径/频率）；非 H5 平台显示「该平台连接器待接入」提示。
- 每行新增「删除」按钮（确认后软删除）。
- 配置抽屉为 H5 源增加社区地址块（baseUrl + startPaths）。

## 测试

- `server/test/connectors.test.js`：+2 用例（按源 config 读 baseUrl 并执行白名单；hostAllowed 反映 env 白名单）。**5/5 通过**。
- `server/test/app.routes.test.js`：+6 用例（POST 白名单内新增 / 内网被拒 / 缺参 400；PATCH baseUrl 白名单校验；DELETE 软删除且物理行保留；DELETE 404）。为测试库补 `config`/`source_type` 幂等列。**15/15 通过**。
- `server/test/repository.test.js`：更新 `updateSource` 参数下标断言（config 列插入导致 sourceId 位移）。
- `worker/test/worker.test.js`：stub repo 补 `markSourceRun` 空实现。**7/7 通过**。
- 全量：server 70/70、worker 7/7。

## 端到端自测（真实 server + 测试库）

新增 → 内网 URL 被拒(400) → 写凭据(明文不回显) → 检测授权(authorized) → 手动采集入队 → 列表可见 → 软删除 → 列表隐去 → 物理行保留(deleted:true, baseUrl 完整)。全部通过。

## 安全边界（保持不变）

- SSRF：env 白名单是唯一可信边界，页面填入的 baseUrl 必须过 `hostAllowed`；localhost/内网非白名单一律拒绝。
- 凭据：仅以 AES-256-GCM 密文落 `po_credentials.secret_cipher`，永不回显/记录明文；`CREDENTIAL_ENC_KEY` 缺失 fail-closed。
- 未授权源 fail-closed，不伪造采集数据。
- 2026-09-01：正式运行 `.env` 的 `BIGPLAYER_H5_ALLOWED_HOSTS` 已上线 `club.q1.com,club-en.q1.com`，保留原国内域名并纳入境外固定社区地址白名单；未改业务代码。
- 软删除保留历史数据，零迁移（复用现有 `config` JSON 列）。
