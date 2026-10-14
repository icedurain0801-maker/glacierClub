# 5A-2RRR Resume 最终独立只读验收报告

- 日期：2026-09-09
- 角色：测试负责人
- 目标：`127.0.0.1:43306/public_opinion_023_e2e_7e4ed9f5`
- 边界：只读 SQL、日志哈希和 harness 审查；未执行 `e2e-5a2.js`、`--resume` 或 `--verify-only`，未改数据库、业务代码、Worker、legacy 或 3306。

## 结论

**PASS。** 5A-2RRR 阶段化续跑的最终终态与执行日志证据一致，可进入项目经理后续发版流程。

## 独立只读验收

| 门槛 | 结果 | 证据 |
|---|---|---|
| 隔离身份 | 通过 | 最小权限账号连接到 `public_opinion_023_e2e_7e4ed9f5`，端口 `43306`、server-id `423309`、认证用户 `po_e2e_5a_7e4ed9f5@127.0.0.1` 全部匹配 |
| 唯一 scheduled run | 通过 | 三来源仅一条 run：`5a200000-0000-4000-8000-000000000001`；eligible source、状态 `queued`、trigger `scheduled`、slot `2026-09-08 18:00:00.000` |
| resume 未重放 first stage | 通过 | 执行日志 `first_stage_replayed=0`，并保留首次入队的同一 run id |
| duplicate 与 slot 唯一性 | 通过 | 日志记录第二次为 `duplicate / SLOT_ALREADY_EXISTS`、epoch `3`；只读终态仍仅一条 run |
| lease 正常释放 | 通过 | eligible state 的 epoch 为 `3`，`lease_run_id`、`lease_owner`、`lease_until` 均为 `NULL` |
| 旧 epoch fencing | 通过 | 执行日志 `stale_renewed=0`、`stale_finalized=0`、`stale_snapshot_unchanged=1`；终态 run/state 与预期一致 |
| 授权过期来源 | 通过 | 日志为 `rejected / ACCOUNT_AUTH_EXPIRED`；数据库无 run、epoch `0`、无 lease |
| capability 缺失来源 | 通过 | 日志为 `rejected / CONNECTOR_NOT_FOUND`；数据库无 run、epoch `0`、无 lease |
| verify-only 只读 | 通过 | `database_read_queries=2`、`database_write_queries=0`，且唯一 run、epoch `3`、无活动 lease |
| 外部及禁止路径 | 通过 | 执行日志：Worker `0`、legacy 切换 `0`、3306 触达 `0`、connector `0`、collector `0` |
| 隔离实例静态健康 | 通过 | root 只读查询：目标库 process `0`、全实例 InnoDB active transaction `0`、lock wait `0` |

## 日志完整性

| 文件 | SHA-256 |
|---|---|
| `.temp/public-opinion-scheduler-5a/e2e-5a2.log` | `C01CFDD13F624E8D300663F4974E52DCE88E466C438BF38AF2662294FC1F23AA` |
| `.temp/public-opinion-scheduler-5a/e2e-5a2-verify.log` | `8C0768E29FA8A90C211FD6788C24621FC7AE4CBD9DD564C6E327E8A6BA314D79` |

## 残余风险

本验收覆盖的是受控 scheduler seam 和隔离数据库终态，不包含真实 Worker、connector 或 collector 的生产外部调用；这些路径在本次验收中按边界保持关闭。
