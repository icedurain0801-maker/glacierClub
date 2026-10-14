# BigPlayer 绑定恢复后唯一 sync 复测报告

- 日期：2026-09-20
- 绑定恢复：**PASS**
- 采集恢复：**FAIL**
- 执行次数：仅 1 次，未重试、未补跑

## 结果

请求：`POST /api/public-opinion/sources/5c21f78d-5f67-4467-963d-dcdeb5e26cab/sync`，body `{"mode":"incremental"}`。

- HTTP `401 UNAUTHORIZED`
- `message=AUTH_REFRESH_FAILED`
- 创建阶段失败，无 `runId`
- 无 queued/running/terminal、计数或 checkpoint 变化
- 后续 sync 已冻结

## 结论

4311 重启、目标 bind/status、scope 错误码透传和定向代码测试均通过，但实际 API/Worker 调用方传入的 source/account 绑定链仍触发 `AUTH_REFRESH_FAILED`。下一步只能只读定位传参链，未完成前禁止再次发起 sync。
