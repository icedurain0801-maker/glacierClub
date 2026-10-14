# v048 实际定时与切换后 Worker 独立核验

日期：2026-10-10。结论：海外实际定时 FAIL，不能 EnableDaily；国内扫描循环正常，采集端到端结果待确认。

## 海外实际定时

经理唯一 RunOnce 返回 `OVERSEAS_PRODUCTION_LEGACY_CHILDREN_REQUIRE_HANDOFF`，任务保持 Disabled。slot 为北京时间 10/10 02:00，窗口为 10/9 00:00–10/10 00:00；parent `3653d4a7-b000-44ee-b60e-0be88f80efa0` 仍 queued，fetched/stored=0。

旧子任务：

| site | run ID | 状态 |
|---|---|---|
| 9 | `7a921b05-6c06-4aa1-9fbd-aeb1c9d47eb7` | completed_authorized_scope |
| 2 | `94399681-ebb8-4b56-b7a4-cc736a209c79` | failed / SYNC_RUN_POISONED |
| 16 | `daf2880d-aa22-4c57-b97a-d911b9e01e4c` | completed_authorized_scope |

三个 child 属于相同 source/account/window 的旧随机身份，不匹配候选确定性 child IDs。site9/16 各 43 条旧关联，不能归为本次新结果。

实际部署源码的 admit 在首个 INSERT/UPDATE 前拒绝；HTTP 与 commitPage 仅在 admit 成功后执行。结合实际错误，支持此次调用在上游 HTTP/内容写入前拒绝。不据此宣称全库零写，不补全库矩阵。

证据：`C:/ProgramData/PublicOpinion/overseas-daily/logs/daily.log`、`state/slot-1791568800000.json`；独立原件：仓库根 `.temp/qa-v048-daily-readonly-1791605355400.json`。

## 国内切换后最小只读核验

切换时间为北京时间 12:07:16。真实服务 XML 指向日志目录 `C:/ProgramData/PublicOpinion/candidate-staging/worker-release-taptap-20260921-v055-formal1/logs/PublicOpinionWorker`，不是旧 `logs/PublicOpinionWorker` 目录。

- 12:07:17 首次扫描为 WORKER_SCAN_ACTIVE；12:08–12:11 连续扫描完成，结果 queued=0/manual=0/scanned=0。
- 12:11:50 只读快照中，稳定 worker 心跳 last_seen_at=04:11:24.175 UTC（北京时间 12:11:24），scan_status=completed、scan_error=null、current_scan=null，约 26 秒前更新。
- 实际 err.log 最后更新为 10/8 09:56:56，内容为 shutdown failed: ECONNREFUSED；它不是此次切换后的新错误。已查看的切换后 out.log 尾部无失败记录。
- 国内 schedule 的 last_scan_at/last_status 为空，两条既有游标 next_scheduled_at 分别为 06:00 UTC 与 18:00 UTC（北京时间 14:00 与次日 02:00）；旧 lease 已过期。不能用这些游标替代国内源完成证据。
- 原件查询采用较宽时间下界，返回唯一 08:00 创建的旧 run `d7830bff-ef41-4ef7-a2a9-821ad4ebc6c4`。数据库 session_now=12:11:50、utc_now=04:11:50；按本地 created_at 切换界限 12:07:16 排除该旧 run 后，未观察到切换后新建国内 run。脚本已修正此下界，未为此重复跑查询。

独立原件：仓库根 `.temp/qa-v048-domestic-worker-1791605510612.json`。仅确认 Worker 扫描循环与心跳正常，不签国内采集端到端 PASS，也不将旧错误或既有 partial 归因此次切换。

## 验证范围与交接

仅新增 QA 脚本与本报告，业务代码未修改。首次国内只读查询因不存在的 s.name 列返回 ER_BAD_FIELD_ERROR，移除该列后查询成功。未触发国内任务、未重跑海外任务、未发上游 HTTP 或收费 AI；v044–v047 已收口通过项不复跑。

失败已退开发做最小范围化 legacy handoff 修复。待经理受控实跑后，仅验实际接口与功能结果；当前不签 PASS、不启日常。
