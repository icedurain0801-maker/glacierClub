# Adapter DATETIME 与 ENQUEUE_FAILED P0 零数据库回归报告

- 日期：2026-09-09
- 角色：测试负责人
- 范围：`worker/src/schedulerRepositoryAdapter.js`、`worker/src/sourceSchedulerRuntime.js` 及相关测试
- 边界：全部为 fake connection/Node 测试；未连接或修改 `7e4ed9f5`，未改迁移、Worker、legacy 或 3306。

## 结论

**PASS。** 准入真实 5A 受控 E2E 重跑。

## 覆盖与结果

| 项目 | 结果 |
|---|---|
| adapter/runtime 专项 | 14/14 通过 |
| 明确调度相关集合 | 70/70 通过 |
| 完整 worker 零数据库套件 | 154/154 通过 |
| ISO UTC | 规范化为 `YYYY-MM-DD HH:mm:ss.SSS` |
| 显式 `+08:00` | 正确转为 UTC，无本地时区漂移 |
| 无时区输入 | fail-closed 拒绝 |
| 规范 DATETIME 与 null | 原样保留 / nullable 保留 null |
| lease/finalize | 所有写入与比较时间参数均统一规范化，旧 epoch fencing 契约通过 |
| 1292 回归 | adapter 不再将含 `T/Z` 的 ISO 字符串直接传给 `DATETIME(3)` |
| ENQUEUE_FAILED 错误 | 仅附加白名单 errorCode 和最长 512 字符的脱敏 message；URI、凭据、Access denied、Unknown database、DNS、超时、IP/host/port 均被清理 |
| 失败隔离 | 失败来源不阻断后续来源继续入队 |
| 空白检查 | `git diff --check` 通过 |

实现不接入 Worker seam，不调用 connector/collector；真实 E2E 仍须只在获授权的 `7e4ed9f5` 受控范围内进行。
