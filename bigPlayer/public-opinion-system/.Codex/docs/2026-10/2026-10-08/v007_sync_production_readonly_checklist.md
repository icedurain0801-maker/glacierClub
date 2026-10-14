# Last Night 生产前只读预检清单

Status: prepared-not-executed

## 2026-10-08 现场只读结果（NO-GO）

- 现场目标身份：`LIUFUYI-2-48:3306/public_opinion`，MariaDB `10.4.14`，server_id `1`，`read_only=0`；结构快照与既有生产基线无表/ledger差异，候选28项哈希及API397/Worker410包manifest复核通过。
- 023–028逐对象结构审查基线结论PASS：checkpoint七列唯一键已由027八列site唯一键替代，028 scheduled_site CHECK已生效；该结论来自SHOW CREATE/`information_schema`，不是仅看ledger。
- 现场活跃风险：Discord仍有`8654`个有效checkpoint租约（共15519个历史running分组）；当前queued Discord run `dff67f90-2481-411a-8841-13607acbb7f1`；`innodb_trx`有事务持有3张表并锁住38311行；processlist有24条连接。BigPlayer历史running checkpoint共277组但当前有效租约0，不能据此假设写入者已排空。
- 服务/进程仍在运行：API PID 29868为旧`v019-lastnight-token-20261008`，Worker PID 19584为旧`worker-release-taptap-20260921-v055-formal1`，Analysis Worker PID 20352、Translation Worker PID 20056均仍连库；MySQL PID5900；未执行停启。
- Windows计划任务`BigPlayer Last Night Overseas Daily 02`与`BigPlayer Q1 Daily 02`均为Ready，下一次均为2026-10-09 02:00（Asia/Shanghai），排空方案必须覆盖；未执行禁用。
- `C:/ProgramData/PublicOpinion`只读检索到服务/配置回滚资产与翻译清理JSON，未发现可证明覆盖`public_opinion`数据库、校验值和恢复演练的完整备份；当前无备份恢复证据。
- 证据文件：仓库根`.temp/po-closeout-20261008/production-preflight-readonly-1791446900135.json`（SHA256 `1c522bf9eb82d111d96feb051dfa782930c3a62a6d4805a46d6a149bf0fb8673`）、`production-os-readonly-20261008.json`；候选文件及隔离原始证据见v005 manifest。

结论：只读预检 **NO-GO**。未满足“备份及恢复验证”“共库写入者排空”“活跃事务/租约解释”门禁，不执行029/030、停启、部署或真实Run。下次窗口须重新采集现场状态，不能复用本次过期租约/进程快照。

负责人：开发负责人提供技术核对，测试负责人独立复核，项目经理组织窗口与授权。2026-10-08 本清单仅准备，未连接生产执行。9月限时授权已过期；隔离QA通过不授权生产操作。冻结候选及原始证据保持不变。

## 检查及停止条件

| 检查项 | 只读证据与核对方法 | 放行条件 / 停止条件 |
|---|---|---|
| 授权范围 | 项目经理提供新的生产决定、时间窗、执行人、目标数据库/服务和允许动作 | 缺少或过期则停止生产阶段；不能把只读核对授权解释为DDL、备份、暂停服务或真实Run授权 |
| 数据库身份 | `SELECT @@hostname, @@port, DATABASE(), VERSION(), @@server_id, @@read_only`，对照批准目标 | 主机、端口、库名、版本均匹配；不输出密码/连接串 |
| ledger | `SELECT version FROM po_schema_migrations ORDER BY version` | 完整文件名核对023、025、026、027、028_bigplayer；不按数字前缀合并另一份028；029/030若已存在需解释来源并重新核对结构 |
| 023–028实际结构 | 从冻结版本迁移文件逐项列出DDL对象，读取information_schema.columns/statistics/table_constraints/key_column_usage/referential_constraints与SHOW CREATE TABLE | 核对全部相关表/列/类型/NULL/default、生成列、索引列序/唯一性/前缀、CHECK及外键；不是仅比较ledger，不运行历史回填SQL |
| 重点结构 | po_sources默认账号与schedule字段；po_source_schedule_state及外键；po_sync_runs trigger/scheduled_at/window/lease字段及CHECK、slot索引；po_sync_checkpoints site/window身份唯一索引；po_source_sites；po_worker_leases/heartbeats | 对照023/025/026/027/028定义及独立QA基线；任一差异先记录、解释和复核，不在线自动修复 |
| 029/030目标状态 | SHOW CREATE TABLE po_sync_runs、po_contents及相应索引 | 缺失应与审计基线一致；部分存在则先检查类型/默认值/生成表达式/索引，禁止裸SQL或伪造ledger |
| 锁与事务 | `SHOW FULL PROCESSLIST`、`SELECT * FROM information_schema.innodb_trx`，必要时读取支持的锁等待视图 | 记录长事务、表访问者、锁等待和观察时间；持锁或未知写入者未解释则不进入DDL |
| Run及checkpoint | 只读查看queued/running/pausing/cancelling Run、活跃checkpoint租约与心跳；仅返回身份、状态、owner和时间 | 现场刷新，不能沿用旧Discord状态；pending队列也须计入恢复风险 |
| 进程与服务 | 只读获取批准范围服务状态、进程入口路径/启动时间、配置文件路径引用；不要展开环境变量值 | 明确API、独立Worker、计划任务、导入程序等全部写入者；旧v055不能继续消费BigPlayer |
| 备份/恢复证据 | 查阅批准窗口备份方案、最近恢复演练报告、备份范围/时间/校验/存储位置与磁盘余量 | 只读清单不创建备份；缺可恢复性证据则停止。实际备份及恢复演练需项目经理安排授权 |
| 排空证据 | 查阅授权暂停/排空计划与恢复顺序，之后只读复查进程、队列、事务、租约 | 检查不执行pause/kill/UPDATE；所有共库写入者含Discord和API导入均须被覆盖 |
| 数据保护基准 | 准备在写入停止后进行准确行数、按主键分块的全原有列摘要比对方案 | 大表扫描会产生负载，窗口内按批准节奏执行；table_rows估值和隔离四列投影不能替代生产完整摘要 |
| 同版候选 | Get-FileHash核对v005 manifest文件、逐条source/证据hash和API/Worker包manifest | manifest自身SHA256为49c0457a6ce481d6498f6e8b2984aee06b3758b4f02acbf1cf3c1a5d7a6a0fda；任一漂移停止并重新冻结QA |
| 部署身份计划 | 对照批准的新API/Worker完整包路径、入口、共享代码hash、外置配置引用和旧版回退资产 | 只核对计划/现状，不复制文件或启动服务；Token v019小补丁不等于本轮完整API候选 |

## 可准备的只读结构查询

以下仅为查询模板；目标连接必须由执行时的批准身份决定，不在文档保存凭据。SHOW CREATE只读取已验证的表名，不拼接任意输入。

```sql
SELECT table_name,column_name,column_type,is_nullable,column_default,extra,generation_expression
FROM information_schema.columns WHERE table_schema=DATABASE()
ORDER BY table_name,ordinal_position;

SELECT table_name,index_name,non_unique,seq_in_index,column_name,sub_part
FROM information_schema.statistics WHERE table_schema=DATABASE()
ORDER BY table_name,index_name,seq_in_index;

SELECT table_name,constraint_name,constraint_type
FROM information_schema.table_constraints WHERE constraint_schema=DATABASE()
ORDER BY table_name,constraint_name;

SELECT id,source_id,account_id,status,lease_owner,lease_until,updated_at
FROM po_sync_runs WHERE status IN ('queued','running','pausing','cancelling')
ORDER BY updated_at LIMIT 200;
```

LIMIT样本只能用于定位，不能作为“所有写入者已排空”的证明。PROCESSLIST和SQL文本可能包含敏感业务值，原始输出需本地受控保存并脱敏后交接，不向聊天复制凭据或业务正文。

## 交接输出

每项记录检查时间、执行人、目标身份、PASS/FAIL/待确认、脱敏证据路径与阻塞原因。结构核对必须逐对象可追溯。全部前置材料齐备后交项目经理决定下一阶段；DDL、备份、停启、切换、真实Run、推送各自遵守明确授权范围。回退方案见v004，不自动down、不删重、不让旧Worker混跑BigPlayer。
