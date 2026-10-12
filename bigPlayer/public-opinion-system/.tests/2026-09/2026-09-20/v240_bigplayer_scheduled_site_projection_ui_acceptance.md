# v240 BigPlayer A' 第三段投影/UI 隔离验收

- 测试日期：2026-09-20（北京时间）
- 测试类型：repository projection + Dock UI 隔离回归
- 边界：未连接真实 DB/服务，未执行迁移、重启、补跑或发版

## 已通过范围

| 检查项 | 结果 | 证据 |
|---|---|---|
| repository projection | PASS | 全量 `server/test/repository.test.js`：139 passed / 0 failed |
| parent/site/runRole/triggerType 投影 | PASS | 详情/列表/latest 输出 camelCase 与 snake_case 兼容字段 |
| 父站点进度 | PASS | `siteTotal/siteTerminal/siteSucceeded/siteFailed` 投影测试通过 |
| latest 优先父汇总 | PASS | latest 查询优先 parent 聚合结果 |
| Dock 展示 | PASS | `sync-run-dock.test.js`：7 passed / 0 failed；覆盖定时汇总、定时子站点 `siteId`、单站任务 |
| 既有 runId 控制路径 | PASS（旧路径） | 控制请求仍调用 `/sync-runs/<runId>/{pause|resume|cancel}` |

## 明确未实现缺口

- parent pause/cancel 不向 scheduled_site child 传播。
- queued parent 被控制后 child 仍可能继续执行。
- 后续 `finishScheduledSiteRun` 可能覆盖 parent 已处于 paused/cancelled 的聚合终态。
- 本轮现有控制测试均为普通 `runId`，没有 parent/child scheduled_site pause/cancel 合同。

## 结论

第三段 **投影/UI 隔离范围 PASS**；但 parent→child pause/cancel 为明确未实现缺口，因此第三段整体 **不能标记全量 PASS，也不能宣称定时多站点控制链路可用**。
