# v193 Worker 心跳身份退役验收

- 日期：2026-09-17
- 范围：Worker 稳定心跳身份、历史 PID+UUID 告警兼容过滤
- 边界：未修改迁移、生产配置、Windows 服务脚本或前端；未连接生产库，未删除/更新生产数据，未部署或重启服务

## 修复逻辑

1. 心跳身份与租约身份解耦：租约继续使用每进程唯一的 PID+UUID，保持 fencing；心跳改用 `worker:<WORKER_ID>`，未配置时使用 `worker:<hostname>`。
2. 稳定身份通过 `po_worker_heartbeats.worker_id` 主键原位更新，进程重启不再新增历史实例行。
3. `listWorkerAlerts` 只过滤已被时间更晚的稳定心跳明确取代的旧版 PID+UUID 行，不修改或删除历史数据；稳定身份自身超时仍正常告警。若回滚后旧版身份产生更新的心跳，其告警不会被旧稳定行吞掉。
4. 多 Worker 按稳定身份逐个保留告警。同一主机部署多个逻辑 Worker 时必须分别配置唯一 `WORKER_ID`；默认 hostname 语义与当前全局 `worker_scheduler` 单租约一致。

## 验收结果

| 检查项 | 命令/证据 | 结果 |
|---|---|---|
| 定向回归 | `node --test worker/test/workerUnifiedSchedulerSeam.test.js worker/test/schedulerRepositoryAdapter.test.js server/test/repository.test.js`，负责人修订后 157 项通过 | PASS |
| Worker 全量 | `npm --workspace worker test`，228 项通过，0 失败 | PASS |
| Server 全量 | `npm --workspace server test`，422 项通过，0 失败 | PASS |
| 租约兼容 | 测试断言 `workerId` 与 `leaseOwner` 独立，既有 lease/epoch 测试全通过 | PASS |
| 告警兼容 | Server Repository 与 Worker Adapter 均断言只过滤被更新稳定心跳取代的旧身份，且不采用“只取最新一行” | PASS |
| MariaDB 语法 | 对生产表执行同形只读 SELECT，查询成功；因稳定身份尚未部署，当前 5 条历史行仍可见 | PASS |

## 剩余风险

- 当前仅对真实 MariaDB 执行了只读语法/现状查询；未部署稳定身份，因此历史行实际退役效果仍需发布后验收。
- 若同一 hostname 上运行多个逻辑 Worker 且未配置不同 `WORKER_ID`，它们会共享心跳行；此部署形态需显式设置唯一 ID。
