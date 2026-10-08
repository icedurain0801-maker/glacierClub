# v011 BigPlayer 授权时序与读取兼容纠偏

## 修复

1. BigPlayer 账密授权改为 `startLogin -> getStatus 轮询 -> claimAuthResult`。
2. 登录失败、挑战、超时、过期、撤销等状态统一为 `AUTHORIZATION_FAILED`，不回退旧 Token。
3. `po_sync_runs` 查询投影增加只读能力探测；缺少 `site_url_snapshot` 或 `last_request_at` 时分别返回 NULL 别名，避免旧 schema 读取失败。

## 约束

- 不修改生产 schema、迁移或其他平台。
- 不恢复旧 HTML 链。
- 修复前后均不得重试真实 Run；QA 门禁继续关闭。

## 验证

```text
auth/read-compat fixture: 11/11 PASS
full minimal regression: 97/97 PASS
manifestFiles=688, missing=0, hashMismatches=0
checksumRows=689, checksumMismatches=0
manifestHash=C3531427911BDC4F16A85ACB7B146EE49404E5182685507B1E8E0616BCE13908
checksumsHash=3563E27AF9332D455EF93E285DC3B3563B0D762103F1E2E3230ECE86C2DBEED2
```
