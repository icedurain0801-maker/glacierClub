---
status: PASS
role: 测试负责人
scope: lfy3001.dev.q1op.com 外网 504 恢复浏览器验收
date: 2026-09-22
---

# v353 lfy3001 外网恢复验收

## 结论

**PASS**。页面、资源、真实概览数据和 Console 均通过恢复验收。

## 已核验

| 检查 | 结果 |
|---|---|
| 外网首页强刷 | PASS；页面正常渲染，非 504、非白屏 |
| 概览真实数据 | PASS；页面显示“今日发布内容 总 98” |
| 外网首页 HTTP | 200，HTML 26256 bytes，无 504 文本 |
| 外网静态 `app.js` | 200，JavaScript 30204 bytes |
| `/api/public-opinion/overview?fresh=1` | 200，JSON 9796 bytes，metrics.total=98，sourceDistribution=bigplayer_h5/count=98 |
| 页面选项与内容 | 境内、超能世界国服版、BigPlayer社区、今日；趋势和内容区均可见 |
| Console | 项目经理使用 IAB 独立读取外网页面 Console，`error/warn=[]`；AX 概览正常渲染 |

## 边界

- 仅访问 `https://lfy3001.dev.q1op.com` 外网地址；未启动或占用本地 3001。
- 未改业务代码、未触碰 BigPlayer 候选、未创建 Run、未写 DB。
- Console 零 error/warn 证据已由项目经理补交并纳入本报告。
