---
last_updated: 2026-09-10
status: reloaded_with_remaining_competitor
scope: p0-analysis-worker-force-reload
---

# v061 P0 analysis Worker 精确强制重载

## 强制终止前门禁

采样时间：`2026-09-10 10:11:32 +08:00`。

- PID `12800` 是系统中当时唯一的 `node src/analysisWorker.js` 实例。
- 其 active analysis lease 共 10 条，全部属于 disabled target source `5c21f78d-5f67-4467-963d-dcdeb5e26cab`。
- 非目标 source active analysis lease：0。
- active sync run：0。
- active sync checkpoint：0。

## 重载结果

- 仅执行 `taskkill /F /PID 12800`，未携带 `/T`，旧 PID 已确认退出。
- 原 npm/cmd 启动链随子进程退出。
- 在 `public-opinion-system/worker` 目录按原命令 `npm run start:analysis` 启动一个隐藏实例。
- 新 analysis Worker PID：`22552`。
- 启动时间：`2026-09-10 10:12:13 +08:00`。
- 新进程存活、可响应，数据库连接存在，stderr 为 0 字节。
- 启动日志持续输出 backlog 心跳；对 disabled target source 的 10 条 deep 未发生认领，构成 v056 门禁已加载证据。

## 租约终态

`2026-09-10 10:14:06 +08:00` 快照：

- target source 保持 disabled。
- deep：completed 80、retryable 10、running 0。
- target source active analysis owner：0。
- target source active sync run/checkpoint：0。
- 未删除或手工修改 jobs、contents、credentials、schema。

稳定成功码：`P0_ANALYSIS_WORKER_RELOADED_WITH_V056`。

## 新发现与剩余风险

切换窗口内，另一个既有通用 Worker PID `46764`（`node src/worker.js`）曾短暂接管目标 10 条 deep，随后在 `10:13:43` 将其释放为 retryable。该进程目前持有非目标 source 的同步任务，未对其执行任何操作。

因此新 analysis Worker 已加载 v056 且验证不认领 disabled source，但系统仍存在一个可能未热加载 v056 的通用 Worker。下一次真实 manual 采集前，仍须确认所有会调用 `claimAnalysisJobs` 的常驻实例均已加载 v056，或再次满足严格无竞争门禁。

本轮未启用 source、未采集、未提交、push 或发版。
