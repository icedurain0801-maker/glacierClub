# v021 本机 3000 同步 Dock 取消验收 fixture

## 变更

- 为 `bigPlayer/.temp/public-opinion-acceptance-server.js` 增加仅本进程内存的运行记录路由：列表、详情、来源 latest、空内容和 run 控制。
- 固定验收 run：`fixture-sync-run-cancelable`，来源：`fixture-bigplayer-token`。来源深链可使用 `sources.html?syncSourceId=fixture-bigplayer-token&syncRunId=fixture-sync-run-cancelable`。
- `POST /api/public-opinion/sync-runs/fixture-sync-run-cancelable/cancel` 仅把内存状态从 `running` 改为 `cancelled`，响应 `meta.fixture=true`，并明确写明未执行真实采集；适配器重启即恢复为 `running`。

## 验证

- `node --test .tests/2026-09/2026-09-18/v220_acceptance_sync_run_fixture.test.js`
- 适配器 HTTP 断言：列表、详情、latest、取消、取消后轮询和非法二次取消。

## 安全边界

- 仅监听 `127.0.0.1:3000`，不访问 3001、4320、数据库、provider 或凭据。
- 未将控制 POST 转发至任何真实服务；状态仅在 adapter 进程内存中保存。
