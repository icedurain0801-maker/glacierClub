---
status: implemented
scope: 舆情数据概览 / 趋势与处置 / 口碑趋势
reported_at: 2026-09-20
---

# 口碑趋势补充中性情感

## 变更

- 口碑趋势图例新增中性系列，使用灰色系柱条。
- 每个日期并列渲染正向、负面、中性三组柱条，共用当日内容量比例尺；零值保留系列位置但隐藏空柱。
- 顶部摘要拆分为正向率、负面率、中性率，三项均以 `positive + neutral + negative` 为分母。
- `unclassified` 继续排除在趋势主系列和中性率分母之外。
- 日期提示文本补充三类数量和已分类总量。

## 变更文件

- `admin/PublicOpinion/assets/app.js`
- `admin/PublicOpinion/index.html`
- `.tests/2026-09/2026-09-20/v001_reputation_trend_neutral_series.test.js`

## 验证

```text
node --test .tests/2026-09/2026-09-20/v001_reputation_trend_neutral_series.test.js
# 3/3 PASS

git diff --check -- admin/PublicOpinion/assets/app.js admin/PublicOpinion/index.html
# PASS
```

## 未覆盖

- 本次未启动 HTTP 服务或浏览器，不触碰生产数据和服务端代码。
- 地区-社区、平台和时间范围筛选沿用现有 overview 请求链路，未新增查询口径。
