# P0 精确补分析只读验收

结论：**四条精确恢复 PASS；分析队列 P0 总体仍 FAIL（解耦与持续消费未交付）。**

## 只读证据

执行 `.tests/2026-09/2026-09-18/p0-exact-analysis.js`（未传 `--execute`）：

| external_id | sentiment | analysis_level | status / attempts | analyzed_at |
|---|---|---|---|---|
| 1498443 | positive | light | completed / 1 | 2026-09-18 14:25:39 |
| 1498442 | positive | light | completed / 1 | 2026-09-18 14:25:39 |
| 1498440 | positive | light | completed / 1 | 2026-09-18 14:25:39 |
| 1497208 | neutral | light | completed / 1 | 2026-09-18 14:25:39 |

检查点记录了 `pending → running → completed`，claim 时间为 `06:25:35.309Z`，完成时间为 `06:25:39.407Z`，均为一次尝试且无错误。

## P0 未通过项

- 当前主 Worker（PID 37296）仍非独立分析消费者；未发现运行中的 `analysisWorker`。
- 队列 pending=37,479，最老等待约 1,791,089 秒；五分钟 completed=39 仅为一次快照，不构成吞吐/SLA 证明。
- 无“采集持续进行时仍能消费分析”、失败重试不阻塞、Worker 重启后恢复的运行时四证，不能将精确补分析外推为全 P0 通过。

本次未触发补分析、未删历史任务、未改业务数据。
