# v154 口碑趋势中性展示最终隔离验收报告

- 验收日期：2026-09-21
- 验收角色：测试负责人
- 候选目录：`.temp/candidates/v154-reputation-trend-neutral-20260921/`
- 结论：**FAIL**

## 范围

仅验证 `bigPlayer/admin/PublicOpinion/index.html` 与
`bigPlayer/admin/PublicOpinion/assets/app.js` 的 v154 候选，不包含多站点、风险、抓取、Worker、数据库或迁移事项。

## 唯一错误

`127.0.0.1:3000` 当前提供的正式 `index.html` 仍引用
`assets/app.js?v=153`，没有提供候选中的 `assets/app.js?v=154`。因此无法在指定的免登录 3000 实例上加载并验收 v154 候选页面；不得把 v153 页面结果认定为 v154 浏览器通过。

## 已通过的只读检查

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 候选 manifest 完整性 | PASS，8/8 | 2 个业务文件与 6 个 supporting 文件 SHA256 复算匹配 manifest |
| 候选范围 | PASS，2/2 | 仅 `index.html` 的 `v153 -> v154` 引用与 `app.js` 在候选范围内 |
| 候选合同测试 | PASS，4/4 | 三类情感渲染、`unclassified` 排除、中性为 0 不画伪柱、排除域不携带 |
| JavaScript 语法 | PASS | `node --check` 通过 |
| 真实 API | PASS，HTTP 200 | 下述固定窗口的三类情感合计与总数一致 |

## 真实 API 口径

```text
GET /api/public-opinion/overview
from=2026-09-17T00:00:00+08:00
to=2026-09-18T00:00:00+08:00
regionCode=domestic
communityId=00000000-0000-0000-0000-000000000101
platform=bigplayer_h5
fresh=1
```

- 请求地址：`http://127.0.0.1:3000/api/public-opinion/overview`
- 返回窗口：`publishedFrom=2026-09-16T16:00:00Z`，`publishedTo=2026-09-17T16:00:00Z`
- `sentiment`：正向 `94`，中性 `58`，负面 `24`，合计 `176`
- `metrics.total=176`；趋势样本中 `unclassified=0`，三类合计等于 `total`

注：接口参数使用 `from/to`；使用 `publishedFrom/publishedTo` 会返回 `INVALID_INPUT unsupported query parameter`，不属于候选前端缺陷。

## 浏览器验收

| 视口 | v154 候选结果 | 说明 |
| --- | --- | --- |
| 桌面 | BLOCKED / FAIL | 新建的 3000 标签实际加载 `assets/app.js?v=153`，不是候选 `v=154` |
| 375x667 | BLOCKED / FAIL | 候选静态页面未进入 3000，继续调整视口不能形成 v154 验收证据 |

当前 3000 页面可正常显示“正向 / 中性 / 负面”图例，但该事实仅说明 v153 当前页面可用，不能替代 v154 浏览器验收。

## 退回条件

开发负责人需提供由 `127.0.0.1:3000` 实际加载的 v154 候选静态入口（且脚本 URL 为 `assets/app.js?v=154`）。届时重新进行桌面与 `375x667` 盲测、筛选参数继承、三类摘要/柱/提示信息及无溢出检查。
