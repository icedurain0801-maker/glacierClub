# v215 siteUrls 多社区真实浏览器回归矩阵

- 状态：开发交付完成，待 QA 在受控保存窗口执行
- 范围：Last Night、X-Clash、至少一个境内 BigPlayer 社区的多站点保存与回显。
- 本轮边界：不重复旧 X-Clash 单例验收；在开发交付前不执行保存请求。

## 前置条件

1. 使用下表精确 `regionCode` / `gameId` / `communityId` / `sourceId`；仅允许修改该 source 的站点 URL 行，禁止任何采集、授权、同步或凭据操作。
2. 保存前先用 `GET /api/public-opinion/sources/:sourceId` 记录 `data.config` 原文、`updated_at` 和页面截图；该快照是本次逐例清理的唯一回退值。
3. PATCH 可观测方式：浏览器 Network 保留日志，筛选 `PATCH /api/public-opinion/sources/:sourceId/configuration`，记录 HTTP 状态、请求 `siteUrls`、响应 `data.config.siteUrls` 和 `data.config.baseUrl`。
4. DB 只读证据：由开发/运维使用受控只读连接执行 `SELECT id,game_id,community_id,updated_at,JSON_EXTRACT(config,'$.baseUrl') AS base_url,JSON_EXTRACT(config,'$.siteUrls') AS site_urls FROM po_sources WHERE id=?`；不得在 QA 会话直连或写库。
5. 清理：每个 SU-MC 用例结束后立即用对应的保存前快照完整恢复 `siteUrls` 与首站 `baseUrl`，再次记录 PATCH、强刷回显和只读 DB 结果；恢复失败即停止后续用例并报 P0。

## 指定来源与保存前快照

只读核对时间：`2026-09-18`。保存前仍须重新读取，以该次即时快照为准。

| 社区 | regionCode | gameId | communityId | sourceId | 当前首站/快照摘要 |
|---|---|---|---|---|---|
| Last Night | overseas | `00000000-0000-0000-0000-000000000002` | `00000000-0000-0000-0000-000000000102` | `081a16d2-5545-4afd-9c65-e04777e4540b` | 单站 `https://club-en.q1.com/?env=web&gameId=2177&gameVersion=2177-US-ZS&lang=en-US&languageId=2` |
| X-Clash | overseas | `8b1f0000-0000-4000-8000-000000000116` | `8b1f0000000000000000000000100016` | `8c690d6e-12ea-4ad3-b434-d941276c4906` | 多站已存在；本轮只测复杂参数与隔离，不重复旧单站结论 |
| 超能世界国服版 | domestic | `896b6b25-39ea-4979-bb87-8c1d7334fde7` | `00000000-0000-0000-0000-000000000101` | `5c21f78d-5f67-4467-963d-dcdeb5e26cab` | 单站 `https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS&lang=zh-CN` |

保存前只读快照（用于核对，QA 执行前须重取）：

- Last Night，`updated_at=2026-09-18 16:46:39`：首站为 `https://club-en.q1.com/?env=web&gameId=2177&gameVersion=2177-US-ZS&lang=en-US&languageId=2`，仅一条 `siteUrls`。
- X-Clash，`updated_at=2026-09-18 16:28:22`：三条 `siteUrls` 依次使用 `languageId=2`、`languageId=9`、`languageId=16`，首站为 `languageId=2`。
- 超能世界国服版，`updated_at=2026-09-18 16:11:47`：首站为 `https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS&lang=zh-CN`，仅一条 `siteUrls`。

## 覆盖数据

| 编号 | 社区 | 地区 | 站点数量 | URL 覆盖点 |
|---|---|---|---|---|
| SU-MC-01 | Last Night | overseas | 1 | 含 `?` 查询串、`&amp;`、`=`、中文与 URL 编码参数 |
| SU-MC-02 | Last Night | overseas | 2 | 两条不同站点均含上述查询串/编码边界的组合 |
| SU-MC-03 | X-Clash | overseas | 2 | 不复测旧单例，仅验证多站点与复杂参数 |
| SU-MC-04 | 境内 BigPlayer 测试社区 | 境内 | 1 | 含 `?` 查询串、`&amp;`、`=`、中文与 URL 编码参数 |
| SU-MC-05 | 境内 BigPlayer 测试社区 | 境内 | 2 | 两条不同站点与复杂参数组合 |

## 每条用例的验收步骤

1. 进入指定社区及采集源管理抽屉，记录保存前站点列表、URL 与时间。
2. 输入用例定义的单站点或两站点列表，点击保存一次。
3. 记录 PATCH 请求：请求 URL/方法、HTTP 状态、响应体中的配置或站点列表。
4. 强刷页面，重新打开同一社区、同一 source 的抽屉。
5. 按行核验回显：行数、顺序、每条 URL 字符串与规范化结果必须符合已拍板规则；不得丢失 `?`、`&amp;`、`=`、中文或编码参数，也不得出现实体/编码双转义。
6. 用开发提供的只读方式读取对应 DB 配置，核对社区、source、站点数量和每行 URL。
7. 比对三方证据：PATCH 响应配置、强刷后 UI 回显、DB 配置必须一致。
8. 读取最近 50 条浏览器 `error/warning`；记录结果和截图。

## 通过准则与缺陷判定

| 检查项 | 通过准则 | 失败等级 |
|---|---|---|
| 保存请求 | PATCH 有成功 HTTP 状态，响应能确认目标 source 的站点配置 | P1 |
| 单/双站点持久化 | 强刷重开后行数与顺序准确 | P1 |
| 参数完整性 | 查询串、HTML 实体、等号、中文、编码参数语义与显示符合规范，无丢失或双转义 | P1 |
| 社区隔离 | Last Night、X-Clash、境内 BigPlayer 互不串数据 | P0 |
| 三方一致性 | PATCH 响应、UI、DB 完全一致 | P0 |
| 控制台 | 无未处理 error/warning | P2，若造成保存/回显错误则按 P1/P0 提升 |

## 结果记录

每次执行须记录：测试时间、环境、社区参数、sourceId、输入值、PATCH HTTP 状态和响应摘录、强刷后逐行回显、DB 证据、控制台、截图、PASS/FAIL。若当前工具无法直接观测 PATCH 或 DB，不得伪造结论，标记“未观测”并请求开发提供对应只读证据。
