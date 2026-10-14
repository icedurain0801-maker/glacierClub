# 4D-2RV 中断恢复最终只读验收报告

- 日期：2026-09-09
- 角色：测试负责人
- 目标：`127.0.0.1:43306/public_opinion_023_retry_65a2e4a2`
- 边界：只读 SQL、日志和零数据库 fixture；未改 DB、023、runner、Worker 或 3306，未运行 migration。

## 最终结论

**PASS。** 4D-2RV 的“受控部分 DDL fail-closed -> 仅移障 -> 同库恢复 -> 全量 VerifyOnly”证据链闭合，可结束本阶段验收。

## 验收结果

| 门槛 | 结果 | 证据 |
|---|---|---|
| fixture | 通过 | 零数据库连接；UTF-8、路径、凭据、PID 与新的 source/account 关系契约均通过 |
| 初次 023 | 通过 | `exit_code=1`、`timed_out=0`、命中 `po_migration_023_fail_schema_definition` |
| 初次中断现场 | 通过 | baseline ledger 20、023 ledger 0、部分 DDL 已提交 |
| 连接释放 | 通过 | 首次 runner 已返回；目标库无当前连接、事务或 lock wait |
| 唯一移障 | 通过 | 仅执行 `DROP TABLE po_source_schedule_state` |
| 同库恢复 | 通过 | retry 023 `exit_code=0`；总 runner 文件调用 22 次，无全量 runner |
| ledger | 通过 | 当前精确 21 条；023 恰一条；019-022 缺席 |
| schema 与权限 | 通过 | reconciliation 表、核心列、15 索引、6 外键、两条 CHECK、legacy index 移除、schema/global 权限断言全部 PASS |
| 数据不变量 | 通过 | 修正后的 `sync_runs -> accounts -> sources` 关系查询结果为 0 |
| VerifyOnly 边界 | 通过 | `migration_invoked=0` |
| 证据不可变性 | 通过 | run 和 interrupted 的 SHA-256、UTC mtime 前后完全一致 |

## 关键值

```text
run SHA-256: ae41fab6a69ec5c010d66bb67bb4092fd5fdf4374de20b207f881e940f9e7673
interrupted SHA-256: 28c2904aea578c25973976474b720199d9f90cf17742433c548e9102a9ae8ccc
```

冻结库 `27fb3ffc`、`72cad885` 未被访问、修改或复用。
