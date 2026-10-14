# Last Night 生产只读预检：NO-GO 交接

Status: no-go-awaiting-controlled-window

## 现场身份与结构

采集时间为 2026-10-08 16:08（Asia/Shanghai）。目标为 `LIUFUYI-2-48:3306/public_opinion`，MariaDB 10.4.14，server_id=1，`read_only=0`。生产结构快照与已采集基线无表差异、无 ledger 差异；023–028 最终 DDL 逐对象核对通过，029/030 尚未执行。冻结候选28项 hash、API 397/397 和 Worker 410/410 包 hash 均匹配。

证据：`.temp/po-closeout-20261008/production-preflight-readonly-1791446900135.json`（SHA256 `1c522bf9eb82d111d96feb051dfa782930c3a62a6d4805a46d6a149bf0fb8673`）；`.temp/po-closeout-20261008/production-os-readonly-20261008.json`；冻结候选见 `v005_sync_migration_candidate_manifest.json`。

## 阻断项及归属

| 项目 | 现场证据 | 到期/影响语义 |
|---|---|---|
| Discord checkpoint | Discord account `da655f18-21d7-4b83-a206-931b4dcbb0d0`；现场分组共15519个历史 running checkpoint，其中有效租约8654个；当前 queued Discord Run 为 `dff67f90-2481-411a-8841-13607acbb7f1` | `lease_until > UTC_TIMESTAMP(3)` 才是有效租约；expired running 行不能当作已排空，需按状态、owner、更新时间和新快照确认。该账号由 Worker PID 19584 的旧 v055 调度链使用，不能在DDL窗口继续写 `po_contents`。 |
| BigPlayer历史 checkpoint | BigPlayer分组共277个，当前有效租约0 | 仅表示采样时无有效 checkpoint lease；历史 running 状态仍需窗口前解释/排空，不能把0有效租约当作所有写入者停止。 |
| Discord Run | `dff67f90-2481-411a-8841-13607acbb7f1`，queued，lease_owner/lease_until为空 | queued 仍可能被 Worker 领取；排空前需停止领取源并确认队列不再增长。 |
| 数据库事务/连接 | `innodb_trx` 有一事务锁3张表、38311行；另一事务无行锁但处于 RUNNING；processlist 24条连接 | 事务锁可能阻塞 ALTER 的 MDL/表重建；必须由窗口执行人确认线程归属和自然结束，不能杀未知线程。 |
| API | Windows service `PublicOpinionApi` PID 24752；子进程 PID 29868，入口 `C:/ProgramData/PublicOpinion/releases/v019-lastnight-token-20261008/server/src/app.js`，监听4320 | v019只含上一单 Token 修复，缺本轮029/030完整候选；DDL前后都不能将它当同版 API。 |
| 主 Worker | service `PublicOpinionWorker` PID 19960；子进程 PID 19584，入口 `.../worker-release-taptap-20260921-v055-formal1/worker/src/worker.js` | v055不遵守 BigPlayer board 范围；必须在候选 Worker 可核验后按批准顺序切换，禁止混跑。 |
| Analysis Worker | service PID 20272，子进程 PID 20352，入口同 v055 目录 `analysisWorker.js` | 仍可能读取/写入分析任务和内容关联；DDL窗口必须纳入排空与恢复顺序。 |
| Translation Worker | service PID 14372，子进程 PID 20056，入口 `.../translation-release-p0-20260918144000/worker/src/translationWorker.js` | 仍可能写翻译结果/任务状态，共库写入者，不能只停主 Worker。 |
| 定时任务 | `BigPlayer Last Night Overseas Daily 02` Ready，下次 2026-10-09 02:00，最近结果非0；`BigPlayer Q1 Daily 02` Ready，下次同一时间，最近结果非0 | 两个任务均可重新触发 API/Worker 或脚本写入；排空必须覆盖、恢复时按顺序启用，现场未禁用。 |

## NO-GO 原因

现场没有覆盖 `public_opinion` 数据库、校验值和恢复演练的完整备份证据。检索到的是旧服务/配置回滚资产和翻译清理 JSON，不能证明数据库可恢复。有效 Discord 租约、共库 Worker、活跃事务、Ready 定时任务均未排空。因此本次只读预检 **NO-GO**，不执行029/030、停启、部署或真实 Run。

## 经项目经理重新授权后的可控顺序

1. 重新采集数据库身份、ledger、023–030结构、准确表计数/分块摘要、processlist、`innodb_trx`、Run/checkpoint/heartbeat、服务入口和任务状态；每一步身份不符或状态变化即停止。
2. 由项目经理指定备份执行人，用批准的 `mysqldump`/等价工具覆盖 `public_opinion` 全库结构与数据、触发器/事件/例程（如存在），输出压缩文件、工具版本、开始结束时间、源身份、SHA256、文件大小及磁盘余量。仅服务 XML 或应用 JSON 不算数据库备份。
3. 用隔离 MariaDB（非3306、非43307）恢复备份；验证 dump hash、可连接、表/ledger/关键计数、外键/索引和抽样内容，保存完整原始日志。恢复验证失败则停止，禁止生产DDL。
4. 依项目经理授权排空：先停/阻止两个 BigPlayer 定时任务和其他采集入口；再按依赖顺序让 API、主 Worker、Analysis Worker、Translation Worker 完成或安全停止；Discord/API导入等所有共库写入者纳入同一清单。只读确认 processlist 无相关写事务、checkpoint lease 不再增长、Run队列稳定，保留新快照。
5. 确认旧 v019/v055 不会重新启动或消费 BigPlayer，核对批准的同版 API/Worker 入口、manifest 和配置引用；未通过不得迁移。
6. 仅在上述证据全部 PASS 后，由窗口执行人用冻结 runner 按 `029_bigplayer_site_run_evidence.sql` → `030_bigplayer_board_scope.sql` 顺序执行，逐条保存原始输出；任一锁等待/结构漂移/DDL失败立即停止，保留已应用部分，不做强行 down 或删重。
7. 迁移后先复核结构、ledger、原有列摘要和新增 NULL 投影，再切同版 API/Worker；恢复顺序为数据库读写可用 → API → 主 Worker/调度 → Analysis/Translation → 经授权的目标来源单次真实 Run。每一步均重新核身份和错误日志。

备份、排空、服务操作和真实 Run 均需项目经理在对应窗口明确授权；本交接文件不扩大授权。
