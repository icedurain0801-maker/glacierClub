# v203 三线最小修复合并部署四证验收

- 验收角色：测试负责人；仅做只读 API / MariaDB / Worker 日志 / 管理页核验。
- 执行边界：未触发 Discord，未发起任何新采集，不改写旧 `failed`/`partial`，不 push、发版或删数据。
- 总结：**TapTap/BigPlayer 小窗四证 PASS。** 管理页计数修复后，TapTap 的 API、MariaDB 和页面均为 `changed=29`；Discord 14:00Z 自动化巡检待执行；两日补跑整体仍 FAIL，不能结单。

## 四证结果

| 场景 | API | MariaDB | Worker 日志 | 管理页 | 结论 |
|---|---|---|---|---|---|
| TapTap 有界续跑 | `ce20e2ad-8b8c-46b5-b751-0a6fca5f79cf` 为 `partial/PARTIAL_SYNC`，fetched 597、stored 29、changed 29、unchanged 568，页预算 cursor `from=480` | trigger=`manual`；窗口 `2026-09-17T16:00:00Z` 至 `16:30:00Z`；lease 已清空；`po_sync_run_contents` 597 条且 content_id 全部去重 | `03:53:20Z` 扫描取队 1 个任务，`03:54:10Z` 回到终态 | 修复后真实浏览器筛选同一 run 显示“部分完成”、抓取 597、变更 29、未变化 568、评论 49893，与 API/DB 一致 | PASS：从 280 续至 480，安全停在页预算；四证计数一致 |
| BigPlayer X-Clash 安全边界 | `83553ac1-7bc5-4100-b0e0-e6633708fa74` 为 `partial/PARTIAL_SYNC`、0/0，原因均为 `provider_offset_ceiling` | trigger=`manual`；同一显式窗口；lease 已清空，epoch=1 | `03:55:20Z` 取队 1 个任务，`03:55:29Z` 终态 | API 与 DB 计数、原因一致；该海外社区须用对应筛选查看 | PASS：安全 fail-closed，未跨越 offset ceiling、未触网拉取内容 |
| BigPlayer Last Night 健康来源 | `2ab59bcd-5b21-4301-a61d-870a2797facc` 为 `completed_authorized_scope`、0/0、无错误 | trigger=`manual`；同一显式窗口；lease 已清空，epoch=1 | `03:56:20Z` 取队 1 个任务，`03:56:37Z` 终态 | API/DB 已确认；该海外社区须用对应筛选查看 | PASS：授权范围内零数据正确完成，不误报 partial 或失败 |
| Discord 自动化门禁 | 未创建本轮新 run | 未写入 | 未触发 | 未触发 | NOT EXECUTED：按决策等待 14:00Z，必须沿用既有 cursor、只执行一次有界自动化巡检 |

## 一致性与边界

1. 三个 run 的 `window_start/window_end` 均非空，均为 `2026-09-17T16:00:00Z` 至 `16:30:00Z`；`trigger_type=manual`，终态的 `lease_owner/lease_until` 均清空，`lease_epoch=1`。
2. TapTap 的 `po_sync_run_contents` 为 597 条、597 个不同 content_id；与 fetched 597 一致。`stored_count=29` 表示本 run 入库变化统计，不等同 run-content 审计关联数。
3. X-Clash 继续把 provider ceiling 明确呈现为 `PARTIAL_SYNC/COLLECTION_BOUNDARY_INCOMPLETE`，没有把无法证明完整性的结果改为 completed。
4. 日志不带每个 run ID，但在三个 run 的开始时刻分别记录单任务 `queued:1`，随后回归 `queued:0`；与 API/数据库的 started/finished 时间相符。
5. **展示缺陷已关闭：** 仅修改 `admin/PublicOpinion/assets/collection-runs.js` 的计数兼容映射后，真实浏览器重新加载同一 run，页面由“变更 0”变为“变更 29”；未变更后端计数、旧 run 或采集状态。

## 缺口与结单判定

- BigPlayer 两日补跑仍有 provider `offset=10000` 硬上限，无法证明全 board 目标窗完整性。
- Discord 仍受限流门禁约束，14:00Z 巡检尚未执行，也不能现在手动触发。
- TapTap 已可从 280 安全推进至 480，但本次仍因本地页预算终态为 partial，不能宣称两日补跑完成。

因此：TapTap/BigPlayer 小窗四证可以登记通过；两日补跑继续 **FAIL / 不可结单**。Discord 14:00Z 单次巡检结束后需另开只读验收补充，不得借此改写旧 run。

## 后续小窗续跑补充验收

| run | API / DB | 日志 | 页面 | 结论 |
|---|---|---|---|---|
| TapTap `53306e2f-6a74-405d-912c-81a53a90a60b` | `completed_authorized_scope`；窗口 `16:00Z-16:30Z`；fetched 573、stored/changed 7、unchanged 566；lease 已清空；573 条 run-content 且均去重 | `03:59:20Z` 取队 1 个，`04:00:05Z` 完成 | 真实浏览器显示“授权范围完成”、抓取 573、新增 0、变更 7、未变化 566 | PASS：from=480 有界续跑进入授权范围完成 |
| X-Clash `d65a5a83-6f10-477c-a371-3cadba29929b` | `completed_authorized_scope`；下一显式窗口 `16:30Z-17:00Z`；fetched 5、stored 13、inserted 5；lease 已清空；6 条 run-content 且均去重 | `04:01:20Z` 取队 1 个，`04:07:28Z` 完成 | 本补充轮以 API/DB/日志核验；对应海外社区页面待与 Discord 门禁后一起复验 | PASS（后三证）：未触发 provider ceiling，计数与终态自洽 |

TapTap 与 X-Clash 的新增小窗均不改变“两日补跑仍未完整”的结论。Discord 本轮仍为 NOT EXECUTED，继续等待既定 14:00Z 门禁。
