---
status: queued
priority: P0
date: 2026-09-21
role: test-owner
---

# BigPlayer 多站点产品边界测试门禁

## 有效口径

- 源级非零或父 Run 成功不得冒充多站点通过；
- 必须存在 `1 个父 Run + N 个子 Run`；
- 每站保留并展示：`siteId`、规范化 URL、状态、发现数、入库数、评论数、`errorCode`、最后请求时间；
- 规范化后重复 URL 必须拒绝保存；
- 每站独立 checkpoint/游标；
- 保存、手动、定时、补跑、恢复均枚举全部启用站点；
- 一站失败、两站成功只能为 `partial`，不能为 `success`；
- 现场截图不能证明三 URL 不同，必须通过实际配置/API/数据库/Worker 证据核验。

## 当前验收要求

- 使用已有候选或只读样本，不创建新同步 Run；
- 每个已启用站点必须有独立 connector/Worker/checkpoint/入库/评论证据；
- 父子 Run 汇总字段与逐站终态一致；
- 缺少任一站点样本、runId 或读模型证据时保持 BLOCKED。

## 明确范围外

- API 正式发布；
- 服务重启或切换；
- 数据库迁移；
- 授权流程；
- 评论算法实现。

## 参考

`.Codex/docs/2026-09/2026-09-18/v024_bigplayer_multisite_collection_execution_gap.md`
