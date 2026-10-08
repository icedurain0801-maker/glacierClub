# v018 同步任务 Run 级控制后端切片

- 状态：离线实现与定向测试通过，未部署、未创建真实 run、未调用 provider。
- 范围：`po_sync_runs` 的 pause/resume/cancel 控制、worker lease fencing 和安全页收敛；不含前端 dock、跨页展示或 P0/翻译/siteUrls 工作。

## 状态机

| 操作 | 可接受起点 | 持久化状态 | 完成语义 |
|---|---|---|---|
| pause | queued / running | queued 直接 `paused`；running 先 `pausing` | 当前安全页写入和 checkpoint 更新完成后，原 lease owner 以 owner+epoch 栅栏收敛到 `paused` |
| resume | paused | queued | 只允许显式恢复；保留 checkpoint cursor，不自动恢复 |
| cancel | queued / paused / pausing / running | 非运行直接 `cancelled`；running 先 `cancelling` | 当前安全页完成后由原 lease owner 收敛 `cancelled`，保留已写内容、cursor 与审计 |

`pausing/cancelling` 可短暂续租并允许当前页事务写入；不可被 scheduler claim。收敛后 lease 被清空，`paused/cancelled` 不在 runnable 查询中。

## API

- `POST /api/public-opinion/sync-runs/:id/pause`
- `POST /api/public-opinion/sync-runs/:id/resume`
- `POST /api/public-opinion/sync-runs/:id/cancel`

请求体必须是空 JSON 对象。非法状态转换返回 `409 SYNC_RUN_CONTROL_CONFLICT`。每次控制请求及 worker 收敛均写 `po_audit_events`。

## 验证

- `server`: `node --test test/repository.test.js`，132/132 通过。
- `worker`: `node --test test/worker.test.js`，82/82 通过。
- `node --check server/src/db/repository.js`、`server/src/app.js`、`worker/src/worker.js` 通过；`git diff --check` 通过。

## QA 前置

已补充 `.tests/2026-09/2026-09-18/v214_sync_run_browser_acceptance_matrix.md` 的受控环境、专用资产、run 标识、计数、断网和恢复离线说明。实际受控资产/URL 尚未授权创建，不能交真实浏览器 PASS。
