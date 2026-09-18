# v207 Discord 06:00Z 有界续跑只读回归

- run：`2983a044-77bc-47a4-9b16-ccdcb1512f82`
- 执行边界：未发送 POST，未创建新 run，未改代码或历史记录。
- 结论：**PARTIAL，不能判为成功；两日补跑仍未完成。**

## 四证

| 维度 | 证据 | 结论 |
|---|---|---|
| API | status=`partial`、fetched 782、stored 779、inserted 1、changed 778、unchanged 3；`PARTIAL_SYNC` 同时包含 owned-content 页预算耗尽（cursor `channelIndex=34`、`before=1514479445891616859`）和多条评论/授权 `RATE_LIMITED` | 正确保留未完成状态，未伪报完成 |
| MariaDB | `trigger_type=scheduled_catchup`、lease_epoch=1，终态 lease_owner/lease_until 已清空；`po_sync_run_contents` 782 条且 782 个不同 content_id；评论 checkpoint 以 `failed` 收口，未持有租约 | 运行内容幂等关联成立，限流子任务隔离收口 |
| Worker 日志 | 06:00:04Z scan 开始→06:01:18Z 完成；06:02:04Z 记录下一次 scan_started。当前日志没有同一次 scan_completed 行，无法独立从日志闭合 run 终态 | 日志证据不完整；以 API/DB 终态为准，不猜测缺行原因 |
| 管理页 | 境外 / Last Light / Discord 筛选同一 run，显示“部分完成”、抓取 782、新增 1、变更 778、未变化 3；页面直接展示 `channelIndex=34` / `before=1514479445891616859` 的页预算耗尽与评论/授权 `RATE_LIMITED` | 页面与 API/DB 的状态和计数一致，未掩盖失败 |
| 重复创建核对 | 06:00Z 后 API 列表中仅发现本 run；派单说明检查时已有 active queued run，未重复 POST | 未观察到重复创建证据 |

## 结果与后续

1. 该 run 于 `06:04:15Z` 收口为 `partial`，而非成功。
2. `p0-discord` 自动化已删除；本报告未触发新的 Discord 续跑。
3. 后续若重试，必须以既有 cursor 有界续跑，并在新的受控窗口补齐 Worker `scan_completed` 日志证据。
4. Discord 页预算与 provider 限流、BigPlayer offset ceiling、TapTap 未完整补跑仍共同阻断两日补跑结单。
