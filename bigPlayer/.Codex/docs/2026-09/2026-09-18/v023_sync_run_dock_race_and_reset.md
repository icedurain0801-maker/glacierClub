# 同步任务 Dock 竞态与受控 Fixture 修复

## 变更范围

- 为共享同步 Dock 的轮询与取消/暂停/恢复请求增加请求序列栅栏，旧轮询响应不能覆盖刚返回的 `cancelled` 状态。
- 关闭动作继续保持只收起并清理深链/本地指针；关闭期间的旧轮询响应不得重新挂回 Dock。
- Dock 脚本缓存版本已提升至 `v=3`，避免 3000 受控浏览器继续使用旧脚本。
- 3000 免登录夹具提供 `POST /api/public-opinion/fixtures/sync-runs/reset`，每次 reset/适配器重启恢复固定 `running 3/7` run；不调用真实采集。

## 验证

- `node --check ../admin/PublicOpinion/assets/sync-run-dock.js`
- `node --test ../admin/PublicOpinion/assets/sync-run-dock.test.js`：6/6 通过。
- `node --test .tests/2026-09-18/v220_acceptance_sync_run_fixture.test.js`：3/3 通过。
- 3000 HTTP 受控链路：reset 返回 `running`、`fetched_count=3`、`discovered_count=7`；cancel 返回 `cancelled` 且 `meta.fixture=true`。
- 3000 浏览器复测：reset 后首次取消显示“已取消”，控制按钮禁用，后续轮询未覆盖终态。
- 3000 浏览器复测：reset 后运行中点击关闭立即隐藏 Dock、清理地址栏 `syncSourceId/syncRunId` 与 `publicOpinionActiveSyncRun`；HTTP 仍为 `running 3/7`，证明关闭不取消 run。
- 终态关闭后强刷仍保持隐藏，未由旧深链或轮询重新挂载。

## 安全边界

- 未访问或修改线上 `3001`，未创建真实 run/provider，未修改同步后端、数据库或采集逻辑。
