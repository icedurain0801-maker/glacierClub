# Discord RATE_LIMITED 终态修复独立 QA 报告

- 日期：2026-09-23
- 角色：测试负责人
- 测试范围：`worker/src/worker.js`、`worker/test/worker.test.js`，以及终态持久化依赖的 `server/src/db/repository.js`
- 禁止项确认：未执行生产 Apply、真实抓取、DDL、服务切换、发布或 v370 验收
- 最终结论：**PASS**
- P0 整体结论：**PASS**（唯一阻断 Discord `RATE_LIMITED` 已关闭）

## 验收结果

| 验收项 | 结果 | 证据 |
|---|---|---|
| attempts=4 仍按原 backoff 回队 | PASS | 独立用例确认调用 `deferSyncRun`，状态路径保持 queued，错误码仍为 `RATE_LIMITED`，并写入非空 `nextRetryAt` |
| attempts=5 终态失败 | PASS | 独立用例确认不再调用 `deferSyncRun`，调用 `finishSyncRun(status='failed')` |
| attempts=99 终态失败 | PASS | 独立用例确认超上限同样进入终态，不因异常 attempts 值重新排队 |
| 终态错误码 | PASS | attempts=5/99 均为 `RATE_LIMITED_MAX_ATTEMPTS` |
| 终态 nextRetryAt | PASS | attempts=5/99 均为 `null`；仓储 SQL 参数同步为 `NULL` |
| lease 释放 | PASS | `finishSyncRun` SQL 明确写入 `lease_owner=NULL, lease_until=NULL` |
| runnable/claim 不再选中 | PASS | `listRunnableSyncRuns` 与 `claimSyncRun` 只接受 queued 或 lease 过期的 running，不包含 failed |
| 重启后仍不可 runnable | PASS | 独立测试模拟重启后的 runnable 扫描与 claim SQL，failed 状态不满足候选条件 |
| 非 RATE_LIMITED 不受影响 | PASS | `MALFORMED_RESPONSE` 仍返回原有 `{ nextRetryAt: null, auditSuffix: '' }` 分类 |
| UTC 与 BigPlayer 已通过逻辑 | PASS | UTC 仓储定向回归 9/9；Discord/BigPlayer worker 定向回归 9/9；worker 全量 92/92 |

## 执行记录

| 命令 | 结果 |
|---|---|
| `node --test .tests/2026-09/2026-09-23/v001_discord_rate_limit_terminal_independent.test.js` | 5/5 PASS |
| `node --test worker/test/worker.test.js` | 92/92 PASS |
| `node --test server/test/repository.test.js` | 146/146 PASS |
| `node --test --test-name-pattern="Discord\|rate limit\|failed sync run claim\|BigPlayer" worker/test/worker.test.js` | 9/9 PASS |
| `node --test --test-name-pattern="UTC database clock\|listRunnableSyncRuns\|finishSyncRun\|deferSyncRun" server/test/repository.test.js` | 9/9 PASS |
| `node --check worker/src/worker.js` | PASS |
| `git diff --check -- worker/src/worker.js worker/test/worker.test.js` | PASS（仅有工作区 LF→CRLF 提示，无空白错误） |
| QA 脚本 `node --check` 与 `git diff --check` | PASS |

## 结论与风险

本次唯一阻断项已满足交测口径，可以关闭。独立测试使用注入仓储和 SQL 合约验证，不连接真实数据库、不发起真实 Discord 请求；因此结论覆盖代码行为与仓储选择条件，不代表生产环境执行验证。当前未发现需要退回开发负责人的缺陷。
