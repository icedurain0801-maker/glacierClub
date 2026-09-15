# 5B Worker Seam 最终独立只读验收报告

- 日期：2026-09-09
- 角色：测试负责人
- 目标：`127.0.0.1:43306/public_opinion_023_e2e_7e4ed9f5`
- 边界：无数据库 fixture 复跑、只读 SQL、日志哈希与 harness 审查；未执行 5B enabled seam，未写数据库，未启动常驻 Worker、connector、collector，未触碰 legacy 或 3306。

## 结论

**PASS。** `worker.js` 导出的统一调度 seam 在 off/enabled 受控隔离 E2E 中满足既定边界与调度契约，可进入项目经理后续流程。

## 验收结果

| 门槛 | 结果 | 证据 |
|---|---|---|
| 无数据库 seam fixture | 通过 | `node --test --test-concurrency=1 worker/test/workerUnifiedSchedulerSeam.test.js`：5/5 通过；off 不调用 job，enabled/shadow 透传注入依赖，无效配置隔离，未配置 seam 时既有 scanner 行为不变 |
| off 零调度/零写 | 通过 | E2E 日志：`skipped / UNIFIED_SCHEDULER_OFF`，scheduler 调用、数据库 query、数据库 write 均为 `0`；harness 使用会抛错的假连接阻断 off query |
| enabled seam | 通过 | 日志 `enabled_seam_calls=1`、`enabled_status=enqueued`、workerId `worker-seam-e2e-5b`；未启动常驻 Worker |
| 5B slot 与幂等边界 | 通过 | 只读终态共 2 条 scheduled run；5B run `5b000000-0000-4000-8000-000000000001` 为 eligible source 的唯一 `2026-09-09 18:00:00.000` slot，状态 `queued`、trigger `scheduled` |
| lease 生命周期 | 通过 | 执行日志记录 epoch `4`、active lease 已观察且正常 release；独立终态 eligible state epoch `4`，`lease_run_id`、`lease_owner`、`lease_until` 均为 `NULL` |
| 过期账号来源 | 通过 | 执行日志 `rejected / ACCOUNT_AUTH_EXPIRED`；独立终态无 run、epoch `0`、无 lease |
| capability 缺失来源 | 通过 | 执行日志 `rejected / CONNECTOR_NOT_FOUND`；独立终态无 run、epoch `0`、无 lease |
| verify-only 只读 | 通过 | `database_read_queries=2`、`database_write_queries=0`；run 总数 `2`、epoch `4`、无活动 lease |
| 外调与禁止路径 | 通过 | 日志：Worker process `0`、legacy 切换 `0`、3306 触达 `0`、connector `0`、collector `0` |
| 隔离实例健康 | 通过 | root 只读查询：目标库 process `0`、全实例 InnoDB active transaction `0`、lock wait `0` |

## 日志完整性

| 文件 | SHA-256 |
|---|---|
| `.temp/public-opinion-scheduler-5b/e2e-5b.log` | `A7A6C376EF145A6A24ED32117FA14CAB7010837D1CD5FEDEB86DAB97499E1DCB` |
| `.temp/public-opinion-scheduler-5b/e2e-5b-verify.log` | `1845094420E4E97891ADB7C4B1B383E631E9451E2EEBBEC07C34E6338F4BD3D0` |

## 残余风险

本验收仅覆盖受控 `worker.js` seam 与隔离数据库，不覆盖真实常驻 Worker、connector 或 collector 的生产外部调用；这些路径本轮按授权保持关闭。
