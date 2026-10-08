# feat(public-opinion): 口碑趋势增加中性系列

## 背景

现有口碑趋势只绘制正向和负面，摘要还将正向与中性合并，无法直接观察中性内容变化。

## 修改内容

- 增加中性图例、灰色柱样式和三列摘要布局。
- 按已分类总数分别计算正向率、负面率和中性率。
- 每日趋势与提示信息展示正向、中性、负面和总数。
- 明确排除 `unclassified`，并保持零值系列无伪柱。
- 将 `assets/app.js` 缓存查询版本提升为 `v154`。

## 文件范围

- `bigPlayer/admin/PublicOpinion/index.html`
- `bigPlayer/admin/PublicOpinion/assets/app.js`

不包含 Worker、TapTap、BigPlayer 多站点、风险分级、数据库或其他工作树改动。

## 验证

- v154 候选 manifest：`8/8 PASS`。
- 候选合同与范围测试：`4/4 PASS`。
- 定向测试：`3/3 PASS`。
- `node --check`：`PASS`。
- 3000 QA release manifest：`31/31 PASS`。
- 真实 API：`HTTP 200`，`total=176`，正向 94、中性 58、负面 24，`unclassified=0`。
- 桌面 `1280x720` 与移动 `375x667`：`PASS`。
- 独立测试报告：`.tests/2026-09/2026-09-21/v311_v154_reputation_trend_neutral_final_pass_qa.md`。

## 回滚

逐路径恢复两份前端文件至发布前版本，并将 `assets/app.js?v=154` 恢复为 `assets/app.js?v=153`。本次无数据库回滚。
