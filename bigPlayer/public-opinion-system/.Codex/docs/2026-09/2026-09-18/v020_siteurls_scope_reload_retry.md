# v020 siteUrls 保存后社区加载重试

## 修复范围

仅修复 `assets/scope.js` 在来源配置保存后立即重新加载页面时，`GET /communities` 单次瞬态失败会把已选社区置空并显示“暂无可用社区”的竞态。

- 同一 scope epoch 下，社区列表只读请求失败时额外重试一次。
- `AbortError`、scope epoch 改变和已中止请求不重试。
- 成功但为空的列表不重试，不伪造可用社区。
- 保留 URL/session 指定的地区、社区与平台；第二次读取成功后正常恢复选择。

未改采集、授权、同步、provider、站点 URL 原子保存逻辑或部署配置。

## 定向验证

- `node --test .tests/2026-09/2026-09-16/v145_scope_core_behavior.test.js`: PASS，6/6。
- 新增回归：第一次 `/communities` 读取返回临时失败时恰好重试一次，第二次返回已启用社区后 scope 仍可用且保留请求社区。
- `node --check ../admin/PublicOpinion/assets/scope.js`: PASS。
- `git diff --check`: PASS。

## QA 受控复测证据

1. 使用 v215 指定的 Last Night、X-Clash、超能世界国服版 `sourceId`，保存前先记录 `GET /api/public-opinion/sources/:sourceId` 的 `data.config` 与 `updated_at`。
2. DevTools Network 勾选 Preserve log，筛选 `PATCH /api/public-opinion/sources/:sourceId/configuration`；记录 HTTP 状态、请求 `siteUrls`、响应 `data.config.siteUrls` 与 `data.config.baseUrl`。
3. 保存后立即刷新同一 URL，确认地区/社区选择器不是“暂无可用社区”，再重开抽屉逐行核对 URL。
4. 开发或运维以受控只读连接执行：
   `SELECT id, game_id, community_id, updated_at, JSON_EXTRACT(config, '$.baseUrl') AS base_url, JSON_EXTRACT(config, '$.siteUrls') AS site_urls FROM po_sources WHERE id=?`。
5. PATCH 响应、刷新 UI 和只读 DB 三方一致后，使用保存前快照 PATCH 恢复；恢复同样记录三方证据。QA 不直连 DB，也不得执行采集、授权或同步。
