---
date: 2026-09-15
status: failed
scope: 告警详情原文图片自适应窄视口补测
owner: 测试负责人
---

# 测试结论

结论：失败，退回开发负责人修复“小图被放大”问题。

## 环境与样本

- 本地服务：`python -m http.server 3000`（遵循仅占用 3000 的约束）
- fixture：`http://localhost:3000/public-opinion-system/.tests/2026-09/2026-09-15/v136_alert_detail_image_adaptation_fixture.html`
- 模式：窄视口 `375` / 抽屉 `320`
- 样本：`PublicOpinion/opinion-favicon.svg`

## 指标证据

页面显示：

- `natural=150x150`
- `computed width=276px`，`height=276px`
- `max-width=min(100%, 480px)`
- `rendered image=276px`
- `detail-text=276px`
- `横溢出=false`
- 宽高比例：`1:1`，比例未变

## 判定

- 窄容器不溢出：通过
- 图片比例不变：通过
- 横向滚动：未发现，页面标记 `横溢出=false`
- 小图保持自然尺寸：失败。原图 `150px`，实际渲染 `276px`，被放大 `126px`

请开发负责人修复图片默认宽度规则，确保 `width:auto` 时小图不被拉伸，再通知测试负责人回归。
