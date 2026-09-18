---
date: 2026-09-15
status: failed
scope: 小图修复后告警详情原文图片自适应回归
owner: 测试负责人
---

# 测试结论

结论：失败，修复后窄模式仍将小图放大，缺陷未解决。

## 环境

- 服务：`python -m http.server 3000`（实际使用 3000，未占用 3001）
- 页面：`http://localhost:3000/public-opinion-system/.tests/2026-09/2026-09-15/v136_alert_detail_image_adaptation_fixture.html`
- 模式：窄视口 `375` / 抽屉 `320`
- 样本：`opinion-favicon.svg`

## 指标

- natural：`150x150`
- computed：`width=276px`，`height=276px`，`max-width=min(100%, 480px)`
- rendered：`276px`
- detail-text：`276px`
- 横溢出：`false`
- 比例：`1:1`

## 判定

- 小图不被放大：失败。`150px -> 276px`，放大 `126px`。
- 图片比例不变：通过。
- 窄抽屉不溢出：通过。
- 宽模式大图 `<=480px`：本轮未验证，因收到叫停/仅需窄模式补测。

页面截图显示窄抽屉内图像填满 `276px` 内容宽度，和上述指标一致。请开发负责人继续修复后重新回归。
