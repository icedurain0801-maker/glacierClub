# TapTap 02:00 run 精确 checkpoint 归属只读 QA

Status: `EXACT_CHECKPOINT_FOUND_IDLE_FROM200 / CROSS_SLOT_RESUME_NOT_VERIFIED`
Owner: 测试负责人
Date: 2026-10-10 (Asia/Shanghai)

## 范围和原件

只按 run `61726610-541b-439b-bce7-a26dda7bae84`、source `26b47b08-0a0d-4265-b377-3d313e2f1131`、account `727b1ded-1ac2-4379-b931-93e94a659af3` 及 checkpoint 复合身份短超时 SELECT。连接验证 3306/serverId 1/`public_opinion`/datadir `\xampp\mysql\data\`，`START TRANSACTION READ ONLY` 后 rollback/end。没有抓取、写库、改频率、清 checkpoint、服务重启或新增消费者；与海外 13316 完全分离。仓库根为 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage`。

- `.temp/qa-taptap-run-checkpoint-readonly.js` SHA256 `da34eba52e1f21b4dae81364975fbf194934bc420c5a2aeb1243d23c6310294f`。
- `.temp/qa-taptap-run-checkpoint-exact.raw.jsonl` SHA256 `79ffbb13f3ca7f1121d65c505426ab67aa03bcd14d98597d6f66c41492eb157f`，exit 0；DB UTC 2026-10-09 18:21:07。项目经理先前限 4 抽样 `.temp/domestic-taptap-checkpoint-readonly-fixed.raw.txt` SHA256 `2e9358c2a690b4149cf5a5e26fb249a9ac96ed723bbb2949081eb562eb7c61d5` 仅为历史样本，不能代替本原件。

## 精确归属

- 本 run `partial/PARTIAL_SYNC`，错误为 `SYNC_PAGE_BUDGET_EXHAUSTED`，消息中的 cursor `{"version":1,"accountIdx":0,"from":200}`。run 窗口是 UTC `[2026-10-08 16:00:00.000, 2026-10-09 16:00:00.000)`。
- 现役 Worker `checkpointWindow()` 将该 run 的有界窗口变为 ISO Z 字符串。复合身份 account + `site_id IS NULL` + `owned_content/owned/posts` + root `''` + 精确 `window_start/end` 命中 checkpoint `caebdaf5-25eb-48f2-ae8a-6477de95ed6f` 一条：`idle`、`cursor.from=200`、`items_fetched=200`、`lease_owner/lease_until=null`、`error_code=null`，本地 `updated_at=2026-10-10 02:02:08`。这证明本 run 对应窗口留下可读取的 cursor，不证明后来已有续页调用。
- 空窗口 `window_start=end=''` 另返回历史 `from=400` idle 行及一条 9 月 21 日过期 running 行；它们与上述有界窗口不共享 checkpoint 身份。由于 `site_id NULL`，历史空窗口出现两行，不能把任一行误配到本 run；本报告未改或清理它们。

## 下一槽适用规则与缺口

现役 source schedule 的 `next_scheduled_at=2026-10-10 18:00:00.000Z`（北京时间 10 月 11 日 02:00），超出本次监控窗口。现役 `scheduleSlots.js` 的每日锚点为每个新日槽生成其上一业务日的新 `[windowStartAt,windowEndAt)`；`worker.js` 的 `syncStage` 和 repository checkpoint claim/get 又把窗口作为精确身份。故若下一合法槽按现行规则生成 UTC `[2026-10-09 16:00,2026-10-10 16:00)`，将是**新 checkpoint 身份**，不会仅凭当前旧窗口 `idle/from200` 自动续取它。本句是现役代码与当前 state 推导，不是下一槽运行证据。先前“下一槽沿用该 cursor”的建议未经验证且与精确窗口匹配规则冲突，应交开发负责人提出历史 partial 窗口的有限、幂等、受控续页方案及影响，不准现在重跑、扩页预算或清数据。

结论：本 run 的 `from200` 保存和 idle/无租约已证实；实际跨槽续页、旧窗口补完、整体 TapTap 成功均 `NOT_VERIFIED`。生产及海外切换仍 `CUTOVER_HOLD`。
