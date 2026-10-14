# 5A-1 隔离 E2E 库迁移与种子验收报告

- 日期：2026-09-09
- 角色：测试负责人
- 目标：`127.0.0.1:43306/public_opinion_023_e2e_7e4ed9f5`
- 边界：只读 SQL 和日志取证；未调用 scheduler/job/Worker/connector/collector，未改数据库或访问 3306。

## 结论

**PASS。** 准入 5A-2 调度 E2E 验收。

## 独立证据

| 门槛 | 结果 | 证据 |
|---|---|---|
| 隔离身份 | 通过 | 目标库、最小权限用户、43306、server-id `423309`、隔离 socket 全部匹配 |
| 标准迁移 | 通过 | 001-018（含双 018）加 023 精确 21 条；migration `exit_code=0`、`timed_out=0` |
| 迁移日志 | 通过 | SHA-256 `7828df5c96be310fa046377cc6d1d063c44bd6d5a506477733bd3d9f4ac2f807` |
| 种子文件 | 通过 | SHA-256 `c37fc5da3ae0c46521c55621c0996bc3917dfa477833faafc72c8c463ef30145` |
| 三来源种子 | 通过 | 3 sources / 3 default accounts / 3 schedule states，所有 source-account-state 归属闭合 |
| 合法来源 | 通过 | `discord`、authorized、未过期、86400 秒、00:00-03:00、状态版本一致 |
| 过期账号来源 | 通过 | default account 在测试 02:00 锚点前一秒过期，可复现授权拒绝 |
| capability 缺失目标 | 通过 | `discord-missing` 来源与账号合法，供 5A-2 capability map 缺席场景使用 |
| 调度 run | 通过 | 目标种子 `po_sync_runs=0` |
| 最小权限 | 通过 | 精确 `ALTER,CREATE,DELETE,DROP,INDEX,INSERT,REFERENCES,SELECT,UPDATE` |
| 零调用与连接状态 | 通过 | provision 脚本无 scheduler/job/Worker/connector/collector 调用；日志四项均为 0；复核时目标当前连接、事务和 lock wait 均为 0 |

## 5A-2 前置限制

仅可在该 43306 隔离库调用受控调度 seam；Worker seam 保持 off，legacy 不切换，禁止真实 connector 或 collector 调用。
