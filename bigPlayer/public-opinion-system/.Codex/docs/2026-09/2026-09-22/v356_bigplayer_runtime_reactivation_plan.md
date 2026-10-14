---
status: active
owner: project-manager
date: 2026-09-22
scope: BigPlayer runtime recovery only
decision: user reactivated previously abandoned 029/site identity work
---

# BigPlayer 运行链恢复排期

## 当前待办

| 顺序 | 工作 | 时限 | 完成标准 |
|---|---|---:|---|
| 1 | 冻结当前 95 条 BigPlayer 基线、schema/ledger/source 原文及 Worker/XML 快照 | 15 分钟 | 只读备份可复核；不删、不改现有 run/checkpoint |
| 2 | 构建 migration 029 与 `site-*`/`legacy-*` 身份对齐候选，覆盖现有 URL 相同但 ID 不同场景 | 30 分钟 | 离线迁移/回滚测试通过；不得写生产 DB |
| 3 | 测试负责人独立复核候选、95 条保留性、调度/租约行为和浏览器入口 | 15 分钟 | PASS 或唯一最小 FAIL |
| 4 | 受控应用 migration、配置对齐并切入同版 BigPlayer Worker | 20 分钟 | 仅在 1-3 PASS 后执行；失败恢复切换前基线 |
| 5 | 最小真实 Run 与浏览器验收 | 20 分钟 | 境内/境外按频率可进入 Worker；帖子/评论有真实产出；窗口、幂等、页面可验证 |

## 不在范围

- 不回放全历史；首次/缺口处理只限最近七天，已抓内容不重复。
- 不改 Discord、TapTap 业务规则；不做 UI、美化、翻译、算法、历史清理。
- 不删除 95 条 failed/stale 基线；只冻结、比对并在新链路成功后按单独规则处理。

## 止损

每阶段到点必须交证据或唯一失败原因。任何 schema/身份/Worker 切入失败立即恢复切换前基线，停止真实 Run，不扩大数据范围。
