---
status: implemented
scope: frontend
---

# 运行记录详情深链初始化修复

## 变更

- 将首次 URL 中的 `runId` 保存为一次性 `pendingRunId`，避免社区 scope 初始化回调先执行时清空详情深链。
- 由首次 scope 初始化或页面 IIFE 统一消费该 ID，并在消费后清空，避免重复请求详情。
- 增加最小 UI 契约测试，验证 `runId` 只消费一次。

## 验证

- `node --test ..\\admin\\PublicOpinion\\assets\\collection-runs.test.js`：3/3 通过。
- `node --check ..\\admin\\PublicOpinion\\assets\\collection-runs.js`：通过。
- 3000 浏览器只读验证：直接打开带 `runId` 的 URL，目标 Run、窗口、评论正文切换正常，未停留在“加载中…”。
- 未调用采集、删除、同步、迁移或任何真实数据写操作。
