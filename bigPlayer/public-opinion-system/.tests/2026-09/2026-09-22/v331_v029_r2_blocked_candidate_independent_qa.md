---
status: fail_blocked_stale_pid_evidence
priority: P0
date: 2026-09-22
role: test-owner
topic: v029-r2-single-instance-maintenance
---

# v029 r2 阻断候选独立 QA

## 结论

**FAIL（阻断候选证据不自洽）；生产仍 BLOCKED。**

候选封装与离线状态机通过，但 `qa-result.json`/handoff 声明 PID `48012/39456` 实时未找到，与当前独立只读探测冲突。因此不得把该候选作为“已正确完成 PID 阻断核验”的 READY 证据；开发需按当前 PID 重新签发实时接线证据。此 FAIL 不表示生产可以继续，3000、共享 gate/多实例广播和外部绕过现场审计仍未覆盖。

## 已通过

- candidate-manifest 12 个 payload 均存在，SHA256 全部复算匹配。
- `node --test .temp/candidates/v029-single-instance-maintenance-20260922-r2/single-instance-maintenance.test.js`：`8/8 PASS`。
- 离线覆盖：DRAINING 入口阻断、已有 claim/renew/settle/commit/read 放行、epoch stale admission、两份 DB 时钟零快照 final fence、NULL lease/非终态/scheduler/scan lease、fail-closed resume、fake service dry-run。
- `127.0.0.1:3000` 当前未监听，未启动代理。

## 失败证据

候选宣称 `pidProbe: 48012/39456 not found`，当前只读探测结果：

| PID | 当前进程 | 路径 |
|---:|---|---|
| 48012 | `PublicOpinionApi` | `C:\ProgramData\PublicOpinion\services\PublicOpinionApi.exe` |
| 39456 | `PublicOpinionWorker` | `C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.exe` |

候选的 PID 缺失结论已经过期，不能作为实时生产接线/维护控制的阻断证据。当前只读探测未修改 PID、服务、端口、DB 或配置。

## 仍未覆盖

- 3000 只读 Playwright 验证：连接拒绝，未启动代理。
- 多实例广播或共享 maintenance gate：候选明确未实现。
- 外部脚本、队列和人工入口：仅目录登记，未现场审计。
- 生产 Windows 服务停启/恢复、MariaDB 029、DDL/config、真实 Run、3001：均未执行。

## 退回要求

开发负责人须重签候选或补交带时间戳的 PID/进程路径/入口接线快照，明确单实例范围与当前运行实例的对应关系；同时保留 3000、共享 gate 和外部绕过的 BLOCKED 状态。收到后再做独立复测。不得以离线 8/8 或 manifest 完整性替代生产维护 READY。
