# v011 BigPlayer 多站点 Run 投影

- 日期：2026-09-20
- 范围：A' 第三段隔离实现；未执行真实数据库、迁移、服务操作或补跑，不能据此判断线上可用。

## 变更

- 同步 Run 的详情、列表和来源最新 Run 投影新增 `parentRunId`、`siteId`、`triggerType`、`runRole`。
- 父 Run 额外提供只读站点进度：`siteTotal`、`siteTerminal`、`siteSucceeded`、`siteFailed`；原 snake_case 字段也保留，兼容既有消费者。
- 来源最新 Run 在同一来源存在多站点父 Run 时优先返回父汇总，避免 UI 误把任一子站点当作全局任务。
- 同步浮窗把 `scheduled_site` 显示为“定时子站点”，父 Run 显示“定时汇总”和站点进度；暂停、继续、取消仍使用原 Run ID 请求路径。

## 验证

- `node --test server/test/repository.test.js`：139/139 通过。
- `node --test ../admin/PublicOpinion/assets/sync-run-dock.test.js`：7/7 通过。
- `node --check server/src/db/repository.js`、`node --check ../admin/PublicOpinion/assets/sync-run-dock.js`、`git diff --check`：通过。

## 边界

- 仅为 API/UI 读投影；未实现 pause/cancel 父子传播。
- 未连接真实 MySQL/MariaDB；站点计数为隔离 SQL 合同覆盖。
