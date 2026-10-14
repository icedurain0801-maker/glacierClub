# BigPlayer 固定近 7 天窗口与统一调度 Mode 独立回归

- 日期：2026-09-11
- 测试角色：测试负责人
- 范围：UTC 固定窗口、DB 7 天锚定、Worker mode、境内 disabled、内容/AI 幂等
- 边界：仅本地/隔离验证；未迁移、未启停生产、未真实采集、未发版或 push

## 执行结果

| 测试范围 | 结果 |
|---|---:|
| Worker 调度/窗口/幂等组合 | 139/139 PASS |
| Server 窗口/入口/幂等定向组合 | 90/90 PASS |
| 目标文件 `node --check` | 6/6 PASS |
| `git diff --check` | PASS（仅既有 LF/CRLF 提示） |

## 验收覆盖

- `publishedFrom/publishedTo` 缺失、逆序、未来或超过 7 天均 fail-closed，网络/详情请求为零。
- 详情只对固定窗口内列表项发起；列表 `createTime` 作为窗口时间，详情时间漂移不改变边界。
- `startRecentSourceBackfill` 使用事务内数据库 UTC 锚定精确 7 天；活动同窗复用已持久化窗口，不重算；不修改 frequency、metadata 或 checkpoint。
- Worker scheduled main 缺失/非法 mode 返回稳定码并退出 1、无业务副作用；`off/shadow` 保留 legacy，`enabled` 让路统一调度。
- 境内 disabled source 受控入口 fail-closed，不能自动启用。
- 内容 upsert 与 AI 分析缓存/队列幂等路径通过，无重复写入或重复分析回归。
- precreated 非法窗口在账号/connector 前终止，保留 `SYNC_RUN_WINDOW_INVALID` 并清理 lease。

## 缺陷分级与结论

- P0：0
- P1：0
- P2：0

**代码合同 PASS，缺陷 0。** 生产外部准入仍为 `NOT_ADMITTED`：migration、可信 Worker/模式、来源与凭据授权及受控真实采集尚未完成。本轮未触发真实同步，不能据此宣称 8/9 号数据已恢复。
