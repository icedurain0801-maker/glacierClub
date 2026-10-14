# sync-runs 回归复测报告

- 日期：2026-09-20
- 结论：**FAIL，继续冻结 sync**

## 执行

```text
node --test server/test/authRefreshCoordinator.test.js server/test/app.routes.test.js
```

结果：`69` 项中 `67 PASS / 2 FAIL`。

## 失败项

- `GET sync run observability routes return latest state, enforce scope, and validate cursors`
- `GET /sync-runs lists safely with strict pagination validation`

两项仍报：`ER_BAD_FIELD_ERROR Unknown column 'r.parent_run_id' in 'field list'`，列表/详情返回 500。当前测试库旧 fixture 的 `po_sync_runs` 仍未兼容 `parent_run_id` 缺失场景，因此尚未证明旧记录能返回 `parent_run_id=null`。

未满足“旧记录/父子 run/列表详情/完整 69 项全绿”门禁，不允许切 API 后发起唯一 sync。
