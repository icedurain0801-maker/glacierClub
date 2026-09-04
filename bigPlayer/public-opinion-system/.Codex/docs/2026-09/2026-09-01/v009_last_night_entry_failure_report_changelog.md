# Last Night 单次任务入口修复

日期：2026-09-01

## 变更

- 修复 `last-night-overseas-daily.cmd` 的 Node 退出码传播：由 PowerShell 等待 Node 子进程并显式返回 `$p.ExitCode`，批处理保存后原样 `exit /b`。
- Last Night 任务每次运行追加稳定 JSON 日志到 `public-opinion-system/logs/last-night-overseas-daily.log`，错误消息经过脱敏。
- 前置目标解析失败时，在任务输出目录创建 `daily-report.json`，记录北京时间前一日窗口、失败阶段、稳定错误码和脱敏错误。
- 下游返回空结果时生成 `LAST_NIGHT_OVERSEAS_DAILY_EMPTY_RESULT` 失败报告并返回非零退出码。
- 保持启用的欧美版目标账号授权门禁、北京时间前一日左闭右开窗口和现有 Q1 采集/分析链路。

## 验证

- `node --test test/lastNightOverseasDailyJob.test.js`：8/8 通过。
- `node --test test/*.test.js`：93/93 通过。
- 未执行真实抓取、真实社区访问、凭据读取或计划任务操作。
