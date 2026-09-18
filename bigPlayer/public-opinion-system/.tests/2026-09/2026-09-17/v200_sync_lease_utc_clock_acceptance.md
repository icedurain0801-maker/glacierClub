# v200 同步租约 UTC 时钟验收记录

## 自动化结果

| 范围 | 结果 |
|---|---|
| Server 全量 | 425/425 PASS |
| Worker 全量 | 228/228 PASS |
| JavaScript 语法检查 | PASS |
| Git 空白检查 | PASS |

## 覆盖范围

- BigPlayer、Discord、TapTap 的 manual 与 scheduled 工作流。
- `started_at`、`lease_until`、`updated_at`、心跳续租和完成 fencing。
- 新增数据、无变化、源头零数据、分页抓取、入库与运行明细。
- Worker 重启后的过期运行恢复、连接器失败、续租失败和幂等点击。
- 历史 `failed`、`partial` 不自动恢复。

## 未执行

- 未连接生产 MariaDB 做东八区会话实测。
- 未部署或重启 API/Worker。
- 未写生产数据库、未补跑历史任务。

## 独立测试负责人复验（2026-09-17）

结论：**PASS（仅代码/隔离夹具验收）**。

### 实测结果

- `server/npm.cmd test`：通过（全量 Server 测试）。
- `worker/npm.cmd test`：`228/228 PASS`。
- `node --check server/src/db/repository.js`、`node --check worker/src/worker.js`、`git diff --check -- server/src/db/repository.js server/test/repository.test.js`：通过。

### UTC 租约核对

- `claimSyncRun` 的领取条件、`started_at`、`lease_until`、`updated_at` 全部使用 `UTC_TIMESTAMP(3)`；自动领取条件只含 `queued` 与过期 `running`，不含 `failed`、`partial`。
- `renewSyncRunLease`、`finishSyncRun`、写前 fencing、分页进度续租和 checkpoint 的领取/过期/续租均使用 `UTC_TIMESTAMP(3)`，有效边界为 `>`、过期边界为 `<`（与“过期即不可续租”的条件等价），不存在 `NOW()` 与 UTC 比较混用的空档。
- runnable 队列、父项恢复筛选、周期到期与 `last_success_at` 成功锚点均由数据库 UTC 时钟驱动。
- BigPlayer、Discord、TapTap 的 manual/scheduled、新增/无变化/零数据、重启恢复、续租、连接器失败与幂等路径由 Server/Worker 隔离事务夹具覆盖；`failed/partial` 自动 claim 拒绝有明确回归用例。

### UTC 与 +08:00 会话判断

本轮没有连接生产 MariaDB，也未写入任何生产表。同步关键判断直接调用数据库 `UTC_TIMESTAMP(3)`，不依赖会话 `NOW()` 或 Node `Date`，因此在 UTC 与 `+08:00` 会话下使用同一数据库 UTC 锚点，认领、续租、fencing 的逻辑结果一致。该结论由 SQL 合约与事务夹具证明。

`DATABASE_URL` 为字符串时，建池分支未额外附加 `timezone: 'Z'`/`dateStrings: true`；这可能影响 Node 对非同步业务时间字段的序列化/读取表现，但本 P0 租约 SQL 不使用 Node 计算的当前时间，**不构成本 P0 阻断**。不得借此扩大到分析/翻译链路。

### 生产六个真实 run 前置条件

本单禁止生产数据库读取/写入与补跑，故以下仅为后续受控实测前置条件，未声称已完成：

1. 部署包含本修复的 API/Worker 构件，并通过调度 schema admission。
2. BigPlayer、Discord、TapTap 各准备一条已启用、已授权、具默认账号的 manual run 与 scheduled run，共六条可审计 run。
3. 执行前记录 run 的 `started_at`、`lease_until`、计数、明细和 checkpoint；验证完成后仅读取对比，不自动恢复历史 `failed/partial`。
4. 在受控测试窗口分别以 UTC、`+08:00` 会话观察同一 run 的领取、续租与完成 fencing；连接器失败仅验证新 run 的失败闭环。

本次未部署、未重启 API/Worker、未写生产数据库、未补跑任务、未 push/发布。
