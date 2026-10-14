# v154 口碑趋势中性展示第三次复验报告

- 验收日期：2026-09-21
- 验收角色：测试负责人
- 候选：`.temp/candidates/v154-reputation-trend-neutral-20260921/`
- 结论：**PASS**

## 复验范围

仅复验 v310 唯一退回项、固定真实 API、桌面与 `375x667` 双视口门禁。不修改业务代码，不发布，不 push。

## 静态入口

- 3000 HTTP：`GET /admin/PublicOpinion/index.html?qa=v154-http-3-20260921` 返回 `200`
- HTTP 返回 HTML：`assets/app.js?v=154`，不含 `assets/app.js?v=153`
- 桌面浏览器 `document.scripts`：`http://127.0.0.1:3000/admin/PublicOpinion/assets/app.js?v=154`
- 移动浏览器 `document.scripts`：同为 `app.js?v=154`
- 正式 `index.html` SHA256：`B09340964825FFEF6DBEAD0AE57A3C28282A009CB99FFD9A7284B7442BAFB4E8`
- 正式 `app.js` SHA256：`507A7C416C3FABE24CC2787DE316A8B5D4BC7DBADB9C019CF3687D99ED0FBB53`

## 候选与发布快照门禁

- v154 候选 manifest：业务文件 `2` + supporting 文件 `6`，共 `8/8`
- 候选合同测试：`4/4 PASS`
- `node --check`：`PASS`
- 3000 release manifest：`31/31`

## 真实 API

固定请求口径：

```text
GET http://127.0.0.1:3000/api/public-opinion/overview
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

## 浏览器复验

### 桌面 `1280x720`

- 页面实际加载 v154
- 图例：正向 / 中性 / 负面
- 口碑趋势：正向 `94`、中性 `58`、负面 `24`、共 `176`
- 比例：正向 `53.4%`、负面 `13.6%`、中性 `33.0%`
- 页面无横向溢出

### 移动 `375x667`

- 独立 Playwright 浏览器实际视口 `[375,667]`
- 页面实际加载 v154
- 同一固定窗口数据显示 `94 / 58 / 24` 与 `53.4% / 13.6% / 33.0%`
- `scrollWidth=375`，横向溢出元素 `0`
- 可见绝对定位元素重叠：`false`

## 最终结论

v310 唯一退回项已解除，v154 候选在指定免登录 `127.0.0.1:3000` 上通过静态入口、真实 API、桌面和 `375x667` 验收，结论 **PASS**。可以回传项目经理进入发布流程；本测试负责人不执行发布或 push。
