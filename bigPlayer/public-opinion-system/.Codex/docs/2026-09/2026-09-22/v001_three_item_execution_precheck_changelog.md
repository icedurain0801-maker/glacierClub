# v001 三项执行前置变更记录

## 2026-09-22

- 修复 `worker/src/worker.js`：领取已有 sync run 时按持久化 `account_id` 解析 BigPlayer 账户，避免使用 source 默认账户造成 credential subject 错绑。
- 新增 `worker/test/credentialBindingAndCatchupWindow.test.js`，覆盖脱敏账户绑定与 scheduled catchup 实际执行窗口上界。
- `scheduled_catchup` 窗口上调逻辑已存在，本次未重复修改，仅补证据测试。
- 只读验证通过：21/21 测试、Node 语法检查、`git diff --check`。
- 未执行生产 DDL、真实 Run、服务切换、重启、发布、push 或访问 3001。

## v353 根因闭包补充

- 复现并修复领取已有 sync run 时的账户绑定：`worker/src/worker.js` 新增 `resolveRunAccount`，优先按持久化 `claimed.account_id` 查询账户，缺失时回退默认账户。
- 新增 `worker/test/credentialBindingAndCatchupWindow.test.js`，覆盖账户绑定与 scheduled_catchup 执行时刻窗口，目标测试 `21/21 PASS`。
- 证据：`.tests/2026-09/2026-09-22/v347_bigplayer_credential_window_repro.md`；独立 QA 待回传。
- 生产运行态、迁移 029、站点 registry 对齐和真实 Run 仍为 `BLOCKED_INPUT`。
