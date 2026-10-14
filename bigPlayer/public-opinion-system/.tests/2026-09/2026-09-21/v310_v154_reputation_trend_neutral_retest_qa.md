# v154 口碑趋势中性展示退回项复验报告

- 验收日期：2026-09-21
- 验收角色：测试负责人
- 候选：`.temp/candidates/v154-reputation-trend-neutral-20260921/`
- 结论：**FAIL**

## 复验范围

仅复验 v309 的唯一退回项及原真实 API、桌面/`375x667` 门禁，不修改业务代码、不发布、不 push。

## 唯一错误（未解除）

虽然工作树正式文件已切换为 v154，且 `../admin/PublicOpinion/index.html` SHA256 为
`B09340964825FFEF6DBEAD0AE57A3C28282A009CB99FFD9A7284B7442BAFB4E8`，但 `127.0.0.1:3000` HTTP 实际返回的入口仍引用 `assets/app.js?v=153`。

证据：

- `GET http://127.0.0.1:3000/admin/PublicOpinion/index.html?qa=fetch-v154-20260921` 返回 HTTP 200；返回 HTML 含 `assets/app.js?v=153`，不含 `assets/app.js?v=154`。
- 新建免登录 3000 标签并使用新查询串打开后，`document.scripts` 实际加载 `http://127.0.0.1:3000/admin/PublicOpinion/assets/app.js?v=153`。
- 因此 3000 静态服务仍未提供 v154 候选，不能将当前页面结果计为 v154 浏览器通过。

## 真实 API 复验

请求固定使用 `from/to`：

```text
GET /api/public-opinion/overview
from=2026-09-17T00:00:00+08:00
to=2026-09-18T00:00:00+08:00
regionCode=domestic
communityId=00000000-0000-0000-0000-000000000101
platform=bigplayer_h5
fresh=1
```

- HTTP `200`
- `metrics.total=176`，`attention=61`，`activeAlertCount=0`
- 情感：正向 `94`、中性 `58`、负面 `24`，合计 `176`
- 趋势 `unclassified` 合计 `0`

## 候选与范围门禁

- manifest：`8/8 PASS`
- 范围测试：`4/4 PASS`
- `node --check`：`PASS`
- `app.js` SHA256：`507A7C416C3FABE24CC2787DE316A8B5D4BC7DBADB9C019CF3687D99ED0FBB53`

## 浏览器门禁

- 桌面：`BLOCKED / FAIL`。3000 实际加载 v153，无法形成 v154 桌面验收证据。
- `375x667`：`BLOCKED / FAIL`。候选仍未由 3000 提供，无法形成 v154 移动端验收证据。

## 退回开发负责人

请先使 `127.0.0.1:3000` 的 HTTP 响应实际返回 `assets/app.js?v=154`，再退回测试负责人复验。当前唯一错误仍为“3000 静态服务返回 v153 入口”。
