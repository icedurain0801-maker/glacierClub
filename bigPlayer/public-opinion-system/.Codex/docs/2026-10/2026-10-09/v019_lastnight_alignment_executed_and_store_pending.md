# Last Night 站点登记真实修正与入库交接

Status: SITE2_RECOVERY_PASS / SITE16_PAGE2_NO_GO / FULL_CHAIN_PENDING
Date: 2026-10-09 (Asia/Shanghai)

## 已执行

- 用户已授权本机当前目标范围执行；现役 root@localhost 权限不是审批门禁。自动巡检仍取消。
- 国内读取/UI 独立 PASS 保持冻结；本次未修改、停止或重启国内 Worker、Discord、TapTap、Facebook、算法及既有健康调度。
- ckYn3w 首次 Store 现场在 schema READY 后返回 LAST_NIGHT_SITE_ALIGNMENT_REQUIRED，requests=[]、stored=0、analysis=not_requested；没有上游请求和 Store 提交，不需要补偿。
- 60JPM6 对齐候选独立 QA 9/9，通过完整 538 文件清单校验。经理串行 inspect 后按现场 planHash 执行 apply，结果 LAST_NIGHT_ALIGNMENT_COMMITTED，insertedSites=2、historicalIdentityChanged=false。
- planHash: 6ed73eba3db1dea845298791d87f5ed0ee2bc5a4c237d2c0913f75c606091ddb。
- 提交后经理只读认证 journal 比对：configMatches=true、registryMatches=true、legacyUnchanged=true；三站 ID/URL/enabled 一致。language2 保留 legacy-8483a64ab230417e63c5e30d77b0a6f0，补 language9/16 登记；原 legacy auth/capabilities 原样保留。
- checkpoint 身份仍 NULL 和原 legacy；没有历史身份迁移、DDL 或删历史。

## 现场证据

仓库根 `.temp/bigplayer-recovery-20261009/lastnight-runtime-60JPM6/`：

- inspect-alignment.controlled-approved.json / inspect-alignment-result.json
- apply-alignment.controlled-approved.json / apply-alignment-result.json
- manifest.json / protected-store-evidence（AES-GCM journal，不明文公开配置或内容）
- store-ai.controlled-approved.json 已准备，尚未执行；旧 ckYn3w 与其他旧包禁止继续执行。

## 并发变化与未完成

登记恢复后现有调度自动于 2026-10-09 11:07:34 创建 scheduled_catchup 父 f49d0d58-926d-4352-8186-f75a0fc4e721，以及三站子 607bafc0-941a-43df-aa45-308c95647f6b、5fd578a1-91a5-4fd0-a3a3-2b7f3aed8ae5、4da86327-92b9-4627-9565-65e985c2f6d9。只读时四条均 queued、started_at/任务 lease 为 NULL、stored_count=0。source schedule lease 属于 source-scheduler:19584-14de533e-7027-4b02-952a-18c3eb7be11f。

这些是新增运行，不是迁移旧历史。为避免并发与盲重抓，本次第二次 Store 未执行。开发负责人正核现役任务领取和单一海外执行入口；不得停共享 Worker，不绕过 active-run 门禁，不扩大国内排查。若既有任务安全完成真实 Store/AI 可复用其证据；否则仅目标海外协调经独立 QA 后串行处理。

真实入库、AI 完成、三站完整日分页/持久 slot、实际 02:00 入口仍未验收。对齐提交、离线 PASS、任务入队均不能称海外全链完成。

## 本批后续真实进展与恢复交接

2026-10-09 UTC 03:19:36 三子已终态：language2 partial/PARTIAL_SYNC（最新帖子检查点 ER_LOCK_DEADLOCK），language9 completed_authorized_scope，language16 failed/SYNC_RUN_POISONED、stored0；父仍queued。旧等待未消费推测撤销：现役下次scan真实领取，账号锁竞争后自动lease recover可产生后续活动。

language2累计stored335，唯一关联272（posts101/comments171）；language9关联同一批272，不能相加。UTC03:13:50独立QA逐项核20分析与内容fingerprint、light/sentiment-v1、completed job一致；UTC03:17:01只读匹配分析已50，UTC03:20:07 light jobs completed70/pending202，deep pending24，动态变化不是全集完成。

101posts raw_payload实际键集合全部仅type，缺incoming board和detail integrity；membership前缀100017仅独立旁证，不能推断详情完整。现役normalizePlatformItem丢失marker代码路径已定位，但不得在共享Worker上修改或重启。现役source frequency21600=6小时，实际due计算不用next_scheduled_at；只改next不能构成每日02唯一入口。

新恢复已派开发负责人实际实施：保留已完成9站页，精准失败task与16未抓恢复、终态CAS/单owner交接、独立详情/scope证据保留、legacy schema单日slot和唯一02入口、AI精确全集。60JPM6保留旧证据，源码变化后禁止执行旧manifest。新候选须独立QA后经理串行执行；不删历史/DDL，不修改国内共享链路，尚未全链PASS。

新增脱敏证据：live-legacy-exact-readonly.json（SHA e068f770b6a5b2d0abc73598a51bfe0dbb5f3daeee85da9bdf521b06e6128cbc）；live-catchup-scope-schedule.json（SHA 50a5dfb4b5382d9839e4e76589e0f6b35903790111f7568d4c1eed9b367cb6b7）；live-catchup-terminal-031936.json（SHA 61172e1af089e8cee75d0e60125235658bb99e9c4fe1e9a0974c404c549b0272）。均位于60JPM6证据目录，不含正文或凭据。

## 2026-10-09 12:02 上海时间现场增量

- 用户再次明确全权限。当前 root@localhost 正常，不重复请求普通权限；旧自动化仍取消。
- puy4g8 精准恢复 language2 的失败 checkpoint 0205567a-70c3-4ca2-a416-456ef2f09a66，从 offset50 完成，新增 run 70473fba-8d4a-4e28-aff7-5b8be1820bb6，new0/reused0。独立 v026 本段 PASS，不重抓 language2 整站。
- language16 首页 run 853d8e9e-255d-44b4-931d-589068ec4964，new0/reused16、hasMore=true、checkpoint idle/offset20/pageIndex2。独立 v027 仅首页 PASS。
- 原 page2 实际 LAST_NIGHT_DETAIL_EVIDENCE_REQUIRED，owner 接棒 epoch1537，但未开始页事务，checkpoint 未推进。独立 v028 NO_GO；旧 committed journal 不直接重放。
- x5YQo8 双 journal 前向恢复候选独立 v030：10/10 增量测试、544+5 清单通过；仅允许经理现场 inspect 后按当前 hash 单次受控执行，不是全链 GO。
- 现场 inspect READY，snapshotHash 4baf722c4b7c1d253b899b4f04ddd3944433a9436f9c8248e3916ef348130517；execute 返回 ER_LOCK_WAIT_TIMEOUT。protected/public 均空，按持久化顺序尚未 owner CAS/HTTP。独立 v031 失败后验。
- UTC04:02:44 只读后验确认 epoch1537、checkpoint idle/items16/offset20、activeRuns=[]。历史具体阻塞语句未捕获，不以大事务规模断言根因。
- 实际 EXPLAIN：OR 活动 run 查询选跨源 status 索引（两次分别 status_lease/queue，rows5）；账号 checkpoint 查询选 account_idx（rows4426）。source JOIN 虽主键各1行，FOR UPDATE 仍可锁 games/communities。开发正另冻目标锁适配器，覆盖整个 forward 与页 writer；不杀现役连接、DDL、重启、修改共享 Worker。旧 x5YQo8 后续执行撤回。

证据在仓库根 `.temp/bigplayer-recovery-20261009/lastnight-forward-x5YQo8/`：inspect/execute 的 controlled-approved 计划、result 和 lock-timeout-readonly-postcheck.json。result SHA 分别 3b25ecf6a32bbd2bd60674b72e692268afeeca4a2fc63cbaff6726e758f8e510、731e83a7d94b91168b03cdccdb0e84e62979484b73ff4f1b894e412ebd375d95。

| 待办 | 当前状态 |
|---|---|
| 国内读取/UI | 独立 PASS，冻结不动 |
| language2 精准失败页 | 真实恢复 PASS |
| language16 第二页 | NO_GO；目标锁收窄候选开发中，再独立 QA |
| language16 23 feeds/comments/replies 完整 consumer | 接线开发中，尚未完整真实运行 |
| 既有 type-only 历史详情证据补齐 | 未完成，不把 membership 当正文完整性 |
| AI 全集 fingerprint/version/profile 核验 | 未完成，局部 completed 不等于全集 |
| 独立每日02单一 slot 路由与失败回退 | 未安装验收；现役6h未提前停用 |
| 海外全链独立验收 | 未完成，不以单页/离线测试结案 |

## AtcaLQ 目标锁候选与真实第二页诊断

AtcaLQ 新候选独立 v032：544+7 清单、12/12 增量测试 PASS。新锁路径的实际 EXPLAIN 已命中 source/account run 专用索引，site/account/status checkpoint 索引估算1行。现场重新 inspect 返回 READY（状态未变，所以重新计算的 snapshotHash 与此前相同），随后 execute 已成功穿过锁并真实读取 offset20/pageIndex2；返回 LAST_NIGHT_DETAIL_EVIDENCE_REQUIRED，不是账号权限或锁超时。

公开诊断20条 post/externalId全部正常：14 detail_enriched、6 summary_fallback/DETAIL_RESPONSE_INVALID。尚待确认无效响应子原因（data形态、ID匹配或内容类型），不猜测、不降低正文完整性门槛。

UTC04:07:16 精确后验：认证 terminal 为 forward_page_precommit_failed，httpExecuted=true、pageCommitAttempted=false；checkpoint 全文字节与 journal.afterCheckpoint 一致，idle/items16/offset20/pageIndex2；source owner lastnight-independent:85c50a17-6d25-4110-8d87-aaaaf34d878c、epoch1538；没有第二页新 run。本页不入库、不推进游标。

证据根 `.temp/bigplayer-recovery-20261009/lastnight-forward-AtcaLQ/`：

- public/85a42830-a442-4ef1-9bd0-bca21f7e1a8e-0002.json，SHA44a6d1827ac9824437c1f08e96b13797ae077e9138a0c8a78a70e8656b8add80。
- protected/85a42830-a442-4ef1-9bd0-bca21f7e1a8e-0004.encrypted.json，SHAe51b7ee5d45f68d8636f025c2a449230a7dcc8d771aac76c34f9cf399b74b2ae。
- execute-forward-resume-result.json，SHA739665f8e782d9ca840a394591d20b63bb6c22702de47d11a5e558f3907de93f。
- page2-detail-failure-postcheck.json（只读，不含正文或凭据）。

开发已接收6条准确详情缺陷并准备绑定该页失败ID的必要响应结构诊断/隔离解析修复；完整consumer和02路由继续原单。全链仍未完成。
