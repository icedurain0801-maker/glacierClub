# BigPlayer 凭据绑定与 scheduled_catchup 复现

## 结论

- 已复现并修复领取已有 sync run 时按 `claimed.account_id` 绑定账户的问题；此前路径无条件读取 source 默认账户，可能导致 credential subject 错配并触发 `CREDENTIAL_NOT_FOUND`。
- `scheduled_catchup` 的执行时刻窗口上调逻辑已存在于 `worker/src/sourceScheduler.js`，本次仅补回归证据；窗口结束时间覆盖实际执行时刻，00:00 内容不会因旧上界被排除。

## 修改

- `worker/src/worker.js`：新增 `resolveRunAccount`，有 `account_id` 时优先调用 `repo.getAccount`，无绑定时保留 default account 回退。
- `worker/test/credentialBindingAndCatchupWindow.test.js`：新增脱敏账户绑定测试与 catchup 窗口测试。

## 验证

```text
node --test worker/test/credentialBindingAndCatchupWindow.test.js worker/test/sourceScheduler.test.js
21/21 PASS
node --check worker/src/worker.js
node --check worker/src/sourceScheduler.js
git diff --check
```

## 外部输入

BLOCKED_INPUT：未读取 secret/token 密文，未执行 check-auth、真实 Run、生产 DDL、服务切换、重启、发布或 3001 访问；生产运行态账户/凭据是否已按绑定账户修复需测试负责人和开发负责人后续只读验收。
