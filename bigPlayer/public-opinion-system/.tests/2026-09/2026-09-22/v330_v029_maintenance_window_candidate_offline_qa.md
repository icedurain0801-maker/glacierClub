---
status: qa_pass_read_only
priority: P0
date: 2026-09-22
role: test-owner
topic: v029-maintenance-window-offline-qa
---

# v029 受控维护窗口候选离线 QA

## 结论

**QA_PASS_READ_ONLY。**

候选离线状态机与契约测试独立复跑通过；本结论只允许流转到维护窗口执行预检，不代表生产维护、MariaDB 029 执行、服务切换或迁移完成。

## 独立验证

- 候选：`.temp/candidates/v029-maintenance-window-20260922/`
- `node --test .temp/candidates/v029-maintenance-window-20260922/maintenance-window.test.js`：`10/10 PASS`
- candidate-manifest：`.temp/candidates/v029-maintenance-window-20260922/candidate-manifest.json`
- `maintenance-window.js` 声明/复算 SHA256：`C4AB1703A301F2203B295E8527E6DB6FF2D97FA77C0401095EEA207324FEC891`，匹配
- `maintenance-window.test.js` 声明/复算 SHA256：`E0AC69C6A3721FA087F43AA9A5A738B475E0EE4B9163E9562F4D9ED69DD0744C`，匹配
- qa-result 声明：`databaseChanged=false`、`servicesChanged=false`、`realRunCreated=false`

## 覆盖通过

- `DRAINING` 阻断 API/manual/legacy/legacy_periodic/daily/manual_reanalysis/Worker/scheduler/scan/scheduled_site 新建入口。
- `DRAINING` 允许已有 queued claim，以及在途 lease renew/settle；`QUIESCED` fence 阻断 claim。
- NULL checkpoint lease 计入 active，不能形成零快照。
- scheduler lease、scan lease、`queued/running/pausing/paused/cancelling/cancel_requested` 非终态均计入 fence。
- 必须有两份 DB 时钟前进且计数不变的零快照，才进入 `QUIESCED`。
- `RATE_LIMITED` 仅在 `next_retry_at <= DB UTC now` 前由既有调度逻辑处理；候选不强制 claim/重试/取消。
- drain 超时 fail-closed，保持 `DRAINING`，不取消 Run、不清 checkpoint/cursor。
- 恢复必须通过 schema 与 rollback-boundary health check，失败保持 `QUIESCED`，通过后才回 `OPEN`。

## 明确未覆盖

- 生产多 API/Worker 实例的 DRAINING 广播与一致性。
- Windows 服务实际维护控制、优雅停止和恢复操作。
- MariaDB `029_bigplayer_site_run_evidence.sql` 实际执行、metadata lock/lock timeout、ledger 写入与回滚。
- API 之外的外部脚本、队列或人工入口绕过维护 gate。
- 真实 DB、生产服务、真实 Run、config 对齐和 Discord `RATE_LIMITED` 任务处置。

## 下一步门禁

只允许进入维护窗口执行预检：由开发负责人先交接生产入口接线清单、多实例广播方案、服务控制方案、DB UTC/计数/lease/ledger/schema 快照和 029 逐条执行计划。未完成前不得停服务、执行 DDL/config、创建真实 Run或取消 Discord。
