# 02:00 国内 Worker 定向只读 QA

Status: `BIGPLAYER_RUN_COMPLETED_WITH_ZERO_INSERT / TAPTAP_PARTIAL / TWO_COMMUNITIES_NOT_COVERED_BY_THIS_SOURCE`
Owner: 测试负责人
Date: 2026-10-10 (Asia/Shanghai)

## 范围与证据

承接项目经理 `.Codex/docs/2026-10/2026-10-10/v008_domestic_worker_0200_readonly_check.md`。只读连接现役 3306 `public_opinion`，使用指定 run/source/game ID 的 SELECT、短超时和已存在索引；没有全表重扫、抓取、配置或业务写入，也没有停止/重启 Worker。QA 13316 与本次现役 3306 证据完全分离。

- 临时只读脚本：仓库根 `.temp/qa-domestic-0200-readonly.js`，SHA256 `7ff16f746286a7d4e3d461aa4d4294f5faa571db7c5ea5877529c704e0402672`。
- 完整成功查询原件：仓库根 `.temp/qa-domestic-0200-readonly-coverage.raw.jsonl`，SHA256 `7d418b12cf1cd343392a54cddc5f8cca9ce23d3599c544e19b7e5ca992ca224a`；命令 exit 0。前两次探索性查询因字段名与现役 schema 不符而停止，分别保留在 `.temp/qa-domestic-0200-readonly.raw.jsonl` 和 `.temp/qa-domestic-0200-readonly-schema.raw.jsonl`；仅 SELECT，未当作通过证据。
- 成功样本 DB UTC `2026-10-09 18:06:44.598`，会话 `NOW(3)=2026-10-10 02:06:44.598`，即本机 DB 会话时间比 UTC 快 8 小时。没有凭据输出。

## Run、入库与租约

| 对象 | 只读事实 | 判定 |
|---|---|---|
| 大玩家 `e56eebe7-1280-42eb-9d39-d5d90da0f3eb` | UTC 18:01:41 开始、18:04:01 结束，`completed_authorized_scope`、`error_code=null`；`discovered=1071/stored=856/fetched=168/inserted=0/changed=168/unchanged=0/comment_count=233`；run 自身 `lease_owner/lease_until=null` | 已终态，不能把 `stored=856` 或先前 running 时 `168/168` 宣称为新增；本次帖子新插入为 0 |
| 大玩家 run 内容关联 | `po_sync_run_contents` 按 run ID：168 条 posts changed、18 条 comments changed、215 条 comments unchanged，合计 401 关联；均是超能世界国服版 `000...0101` | 本次有旧内容更新/关联，未见这次 run 的新插入；`stored` 与关联条数是不同口径 |
| 大玩家 source schedule | UTC `last_scheduled=18:00`、`next_scheduled=2026-10-10 00:00`（北京时间 08:00）；epoch 1736。02:06:44 仍留 `lease_run_id`/`lease_owner`，`lease_until=18:05:41.672` 已早于 DB UTC；`last_status=null` | run 已完成而 schedule 字段未清，属于过期租约残留/状态未收口的待确认风险；不以 PID 或过期 lease 单独证明健康，不在 QA 中改动 |
| TapTap `61726610-541b-439b-bce7-a26dda7bae84` | UTC 18:02:34 `partial`、`PARTIAL_SYNC`，`SYNC_PAGE_BUDGET_EXHAUSTED`（项目经理原件记录 from200）；`discovered=600/stored=121/fetched=592/inserted=4/changed=117/unchanged=471`，run lease 已空 | 独立于大玩家；确有 4 条帖子新插入，但页预算截断仍未完成，不是全量成功 |

## 两社区覆盖及时间口径

- 圣魂纷争 `8b1f...0001`、我要当老祖 `8b1f...0022` 均为 enabled 社区，但针对两个 game ID 的 `po_sources` 和 `po_accounts` 查询均无行；对应 game ID 按 `po_contents_game_collected_idx` 且本地 `collected_at>=2026-10-10 00:00:00` 的限 1 样本均无行。该检查只证明指定今日窗口无命中，未扫描全历史，也不证明上游为空。
- 唯一受检大玩家 source `5c21f78d-5f67-4467-963d-dcdeb5e26cab`、账号和 legacy 站点均 enabled/authorized，source/account 的 game、community 固定为超能世界国服版；本次 401 个 run 内容关联的 `community_id` 也全是超能。现有共享源不能当作已实际覆盖圣魂、老祖的证据。要启用两社区采集须另拟精确配置/代码与影响方案，本 QA 未执行。
- 现役 v055 repository 的内容 INSERT 未显式传 `collected_at`，沿用表 `CURRENT_TIMESTAMP` 默认；run 调度/开始/结束字段使用 UTC，关联 `fetched_at` 为会话本地时间。故 `collected_at`、`fetched_at` 应按北京时间会话值读，而 run 的 UTC 字段转换 +8 小时。大玩家本次关联内容 `collected_at` 最大为 10 月 9 日 20:05（北京时间，昨日），`fetched_at` 为 10 月 10 日 02:01—02:03；这是“今晚重新抓到/更新旧内容”，不是 `collected_at` 今日新插入。项目经理此前按 UTC 16:00 门槛读出的 201 行，不能当作北京时间今日新增。

## 结论和退回

大玩家 02:00 槽已完成但新插入 0；TapTap 仍为页预算 partial；圣魂纷争和我要当老祖没有本次共享源的实际内容归属证据、今日限窗也无样本。应由开发负责人评估 TapTap 页预算、两社区接线和大玩家 schedule 过期租约残留，先交精确影响/修复方案；QA 不改业务代码、数据、生产配置或服务。既有半小时巡检继续跟踪，未另建消费者或监控。海外发版仍 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`。
