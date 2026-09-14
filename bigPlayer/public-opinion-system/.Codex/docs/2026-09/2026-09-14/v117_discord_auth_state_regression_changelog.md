# v117 Discord 授权状态回写回归

## 变更

- 在 `server/test/app.routes.test.js` 增加 Discord `check-auth` 授权状态回写回归测试。
- 覆盖授权成功后 source/account 均为 `authorized` 并允许 bounded 入队。
- 覆盖授权失败保持 `unauthorized`、`/sync` 返回 `SOURCE_UNAUTHORIZED` 且不入队。
- 未修改生产代码、Repository、connector、凭据、频率或 checkpoint。

## 验证

- `node --test --test-concurrency=1 server/test/app.routes.test.js`：57/57 通过。
- `npm --workspace server test`：400/400 通过。
- 真实目标 source `check-auth`：HTTP 200，source/account 均回写 `authorized`。
- 唯一受控 bounded run `ddda8832-5a81-438e-9a03-e5b3384541cd`：终态 `failed`，首个错误为 `disabled or official API endpoint required`，计数均为 0；按闸门未重试。
- 旧 Worker PID 43568 于恢复提交前启动；按授权重载为 PID 62168，并以 `UNIFIED_SOURCE_SCHEDULER_MODE=enabled` 正常运行。
- 最终 bounded run `a116e1bb-68b5-4c74-8cf5-a808c6491be7`：终态 `partial`，`fetched=815`、`inserted=22`、`changed=793`、`stored=815`、`comment=0`；首个错误为 Discord comments page 1 `CONNECTOR_PAGE_FAILED`，未再次重试。
