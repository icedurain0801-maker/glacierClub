# 5A-0 零数据库调度 Fixture 验收报告

- 日期：2026-09-09
- 角色：测试负责人
- 执行工件：`bigPlayer/.temp/public-opinion-scheduler-5a/fixture-5a.js`
- 边界：Node fake dependency fixture；未连接真实数据库，未启动 Worker，未调用 connector 或 collector。

## 结论

**PASS。** 准入 5A-1 的新 43306 E2E 隔离库 provision。

## 独立复跑结果

| 断言 | 结果 |
|---|---|
| 断言总数 | 14 通过 |
| 北京时间 02:00 合法 slot | `2026-09-08T18:00:00.000Z`，首次 `enqueued` |
| 同 slot 重复扫描 | `duplicate` / `SLOT_ALREADY_EXISTS`，唯一 slot 数量 1 |
| 授权过期 | `SOURCE_AUTH_EXPIRED`，无入队 |
| capability 不可用 | `CONNECTOR_CAPABILITY_UNAVAILABLE`，无入队 |
| fake SQL | 11 次，未知 SQL/连接生命周期调用 fail-closed |
| connector 调用 | 0 |
| collector 调用 | 0 |
| 真实数据库命令 | 0 |

本阶段未覆盖真实 E2E 的 lease epoch fencing，该项保留给获准后的 5A-1 隔离库验收。
