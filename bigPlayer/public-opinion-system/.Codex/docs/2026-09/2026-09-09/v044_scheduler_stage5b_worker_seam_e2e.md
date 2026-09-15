# 统一来源调度：阶段 5B Worker Seam 隔离 E2E

- Status: qa_passed
- Priority: P0
- Owner: 开发负责人
- Updated: 2026-09-09

## 范围与边界

仅在隔离实例 `127.0.0.1:43306/public_opinion_023_e2e_7e4ed9f5` 通过 `worker/src/worker.js` 导出的 `runUnifiedSchedulerSeam` 验证 off/enabled 两种模式。未启动常驻 Worker，未切换 legacy，未访问 3306，未调用真实 connector 或 collector，未修改业务代码、迁移或种子。

## 无数据库 Fixture

执行：

```bash
node --test --test-concurrency=1 worker/test/workerUnifiedSchedulerSeam.test.js
```

结果：`5 passed, 0 failed`。off 模式不调用 job；shadow/enabled 正确透传 connection、workerId、clock、capability、lease 和 ID 工厂；错误与无效配置保持隔离；未配置 seam 时既有扫描流程不变。

## 真实隔离 E2E

根临时 harness：`.temp/public-opinion-scheduler-5b/e2e-5b.js`。

- off：返回 `skipped / UNIFIED_SCHEDULER_OFF`，scheduler 调用 0、数据库查询 0、数据库写入 0；执行前后快照一致。
- enabled：仅调用一次 `runUnifiedSchedulerSeam`，由 seam 加载真实 job；workerId 为 `worker-seam-e2e-5b`。
- 固定北京时间 02:00 对应 UTC slot `2026-09-09T18:00:00.000Z`，新建 scheduled run `5b000000-0000-4000-8000-000000000001`。
- 数据库保留前一 slot run 与本次新 run，共 2 条；本次 slot 唯一。
- enabled 路径取得 lease epoch 4，并在记录 active lease 证据后使用同一有效 token 正常释放；最终无活动 lease。
- 过期账号来源返回 `rejected / ACCOUNT_AUTH_EXPIRED`；缺 capability 来源返回 `rejected / CONNECTOR_NOT_FOUND`；两者无 run。
- enabled 受控连接记录 7 次读、3 次写（lease acquire、scheduled insert、lease cleanup release）。
- `worker_process_started=0`、`legacy_switched=0`、`port_3306_touched=0`、`connector_calls=0`、`collector_calls=0`。

执行日志 `.temp/public-opinion-scheduler-5b/e2e-5b.log` SHA-256：`A7A6C376EF145A6A24ED32117FA14CAB7010837D1CD5FEDEB86DAB97499E1DCB`。

## 最终只读快照

随后运行 harness `--verify-only`，结果 PASS：读取 2 次、写入 0 次；目标数据库与 server-id 匹配；scheduled run 总数为 2，本次 run/slot 唯一；eligible epoch 为 4 且无活动 lease；connector/collector 调用仍为 0。

只读日志 `.temp/public-opinion-scheduler-5b/e2e-5b-verify.log` SHA-256：`1845094420E4E97891ADB7C4B1B383E631E9451E2EEBBEC07C34E6338F4BD3D0`。

## 待办

测试负责人最终独立只读验收结论 PASS：fixture 5/5；off 模式 job/query/write 均为 0；enabled seam 调用 1 次并创建唯一 5B slot run，workerId 正确、epoch 4 已释放；两个 rejected 来源无 run；verify-only 为 read 2 / write 0；外部调用、Worker、legacy 与 3306 访问均为 0；目标进程、事务及锁等待均为 0。验收报告：`.tests/2026-09/2026-09-09/v018_5b_worker_seam_final_readonly_acceptance.md`。
