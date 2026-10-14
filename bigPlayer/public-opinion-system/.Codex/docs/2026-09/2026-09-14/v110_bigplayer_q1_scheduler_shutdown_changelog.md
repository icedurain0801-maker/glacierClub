---
date: 2026-09-14
status: completed
scope: bigplayer-fixed-window-scheduler
owner: 开发负责人
---

# v110 BigPlayer 固定窗口调度收尾修复

## 变更

- `worker/src/worker.js`：固定窗口 BigPlayer Q1 采集不再以 100ms 作为队列收尾上限；改为等待该 run 的剩余 deadline。
- 租约失效时仍立即中断等待，保持既有 lease-loss 退出语义。
- 到达 run deadline 后通过既有 deadline 校验进入失败/partial 收口，不再关闭 commit lane 后将零计数写为成功。

## 回归

- `worker/test/dailyQ1Shutdown.test.js`：覆盖单个延迟超过旧 100ms 阈值、但在 run deadline 内完成的 feed，断言完成入库且 run 计数为 1。

## 范围限制

- 未改频率、来源配置、回溯窗口或 checkpoint。
- 未启动 Worker，未触发 run，未操作生产数据。
