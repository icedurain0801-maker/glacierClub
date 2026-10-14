# 舆情概览：端到端验收重开

- Status: in_progress_development
- Priority: P0
- Owner: 项目经理
- Updated: 2026-09-09

## 最终验收目标

精确地址必须端到端可用：

`https://lfy3001.dev.q1op.com/admin/PublicOpinion/index.html?regionCode=overseas&communityId=00000000-0000-0000-0000-000000000102&platform=discord`

静态目录恢复和本地 Mock 验收均只是修复/回归手段，不构成完成。

## 必须满足

1. 页面非 404 且完整渲染。
2. `regionCode`、`communityId`、`platform` 被实际应用。
3. 关键数据模块结束加载。
4. 页面实际调用的 API 无 4xx/5xx、无“舆情 API 暂不可用”。
5. 控制台无阻断性错误。

## 范围与边界

- 本机 Konga 映射环境；仅精确 URL 与实际依赖 API。
- 允许修复静态入口、API 联通及启动本机必要服务。
- 禁止无关页面扩展、外部生产访问、业务数据写入、重新分析/补偿、提交与推送。
