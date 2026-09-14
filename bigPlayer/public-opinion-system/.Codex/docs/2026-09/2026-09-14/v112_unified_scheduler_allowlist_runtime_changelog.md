---
date: 2026-09-14
status: runtime-partial
scope: unified-source-scheduler-allowlist-runtime
owner: 开发负责人
---

# v112 双源 allowlist 调度运行记录

## 运行组件

- Worker：`worker/src/worker.js`
- PID：`56388`
- 启动参数：`UNIFIED_SOURCE_SCHEDULER_MODE=enabled`、`WORKER_INTERVAL_MS=60000`
- allowlist：`5c21f78d-5f67-4467-963d-dcdeb5e26cab,b696e67c-cd20-47bf-97f4-50300feda885`
- 日志：`.temp/unified-worker-allowlist.log`、`.temp/unified-worker-allowlist.err.log`

## 首轮执行

- 两个 `scheduled_catchup` run 均只属于 allowlist 内 source；近三分钟其他 source 新增 run 数为 `0`。
- BigPlayer：`partial`，`COLLECTION_BOUNDARY_UNVERIFIED: Q1 historyStart requires an explicit bounded collection window`；本轮无新增内容计数。
- Discord：`failed`，`disabled or official API endpoint required`；当前未配置官方 API，未写入内容。

## 约束

- Worker 保持运行以提供持续 60 秒扫描、按来源 `frequency_seconds=3600` 判定到期。
- 未改变来源频率、未全量回溯、未删除数据、未重置 checkpoint、未处理其他来源或 Discord connector。
