# 海外 BigPlayer 同步修复：受控窗口可行路径（只读盘点）

Status: design-only-production-no-go
Date: 2026-10-08

本页仅供项目经理与测试负责人评估；未连接生产数据库、未读取凭据值，未停服务/禁任务/备份/锁库/迁移/切换/真实 Run。

## 已有设施与缺口

| 项目 | 只读确认 | 门禁结论 |
|---|---|---|
| 备份/恢复 | `C:/ProgramData/PublicOpinion/audit/backups/public_opinion-20261008082209/public_opinion.sql` 为 831,426,517 字节；隔离严格导入曾成功，见 v011；但没有同快照源端精确计数和数据摘要。v016 执行器只在人工隔离库完成同快照验证。 | 旧 dump 不能替代本次可恢复快照。 |
| 凭据/身份 | 四个 WinSW 服务以 `NT AUTHORITY\LocalService` 运行，配置引用 `C:/ProgramData/PublicOpinion/config/public-opinion.env`；已有服务 DB 身份盘点为 root，非 root `pma@localhost` 不具目标库 SELECT/PROCESS。没有已证明可用的独立观察账号或受控口令管理 API。 | 不创建临时观察账号；不得把 root 填入 `PO_READONLY_DB_*` 冒充最小权限。 |
| 写入者 | `PublicOpinionApi`、`PublicOpinionWorker`、`PublicOpinionAnalysisWorker`、`PublicOpinionTranslationWorker` 当前 Running，WinSW 为 Automatic 且配置失败重启；`BigPlayer Last Night Overseas Daily 02` 与 `BigPlayer Q1 Daily 02` 当前 Ready。API 可手动入队，Worker/分析/翻译及定时任务均可能写库；其他外部连接待核。 | 仅停一个 Worker 不构成全库排空。现有 `disable-legacy-tasks.cmd` 只覆盖 Q1，不覆盖 Last Night，不可直接用于完整排空。 |

## 最小受控生产路径（均待另行批准）

1. **冻结对象与窗口**：项目经理指定执行人、DBA、QA、同版 API/Worker/029/030 候选哈希、维护窗口、最大排空/锁持有/恢复/总耗时、磁盘阈值及联系人。先由 DBA 用现有高权限身份做**明确标注的 DBA 只读预检**，输出脱敏全库事务/连接/对象/规模证据；该身份不能通过最小权限观察脚本，也不能被称为观察账号。须单独批准高权限身份使用及 SQL 审计范围。
2. **停止新写入并有界排空**：经批准后阻断 API 写入口和两项定时任务新触发，暂停四个服务及任何已识别的额外写入者；逐项记录原状态、PID/任务、配置与恢复动作。WinSW 自动恢复需在窗口内验证不会重启；通过 OS 进程/服务/任务、DBA 全库 `PROCESSLIST`/`innodb_trx`、目标库活跃 Run/租约/心跳、两次间隔写入计数共同证明无活动。仅某时刻计数为零不够；发现未知写入者、事务、连接或超时即停止。停机和任务变更均需用户新批准。
3. **同快照门禁**：仅在排空证据完整后，由 DBA 对精确 `public_opinion` 身份运行经 QA 审核的生产专用同快照执行器；FTWRL 锁获取与持锁分别计时，锁内前后源端 Manifest/对象全集一致；同版 `mysqldump` 退出零且 artifact SHA/字节稳定；在全新隔离实例严格恢复并以同版 Manifest 逐表/逐块/逐对象比对。任何子进程、锁释放、磁盘、ACL 或恢复结果不确定都失败关闭。当前正式执行入口仍 `PRODUCTION_EXECUTION_DISABLED`，尚无获批生产实现。
4. **后续分段准入**：备份恢复验收之后，才分别申请 029→030 DDL、同版 API/Worker 切换、Last Night 站点身份对齐事务及单 source 真实 Run；每段独立 QA 与用户批准，不把本页当作打包授权。旧 HTML 不恢复，历史数据不删除。

## 风险、回退与阻断项

- **高权限 DBA 与 root 冒充的差异**：DBA 只在经批准的维护窗口、固定主机/库/语句白名单及审计记录下执行预检与备份；结果标明 privileged，不声称最小权限。`PO_READONLY_DB_*` 继续拒绝 root。风险是全库可见性、误操作和审计暴露；需要用户另行批准身份、查询范围、记录保留和双人见证。
- **当前不能直接 GO**：生产排空/锁窗口无新鲜证明；现有 dump 缺同快照源摘要；生产执行器尚未开放且未验证生产体量硬时限/ACL；外部写入者盘点和 Last Night 站点身份仍有缺口。没有新账号时，完整证明依赖另行授权的 DBA 高权限只读预检，而不是现有只读脚本。
- **停止条件与回退**：任一上界、身份、对象、写入、事务、锁、磁盘、子进程或恢复校验失败，立即释放本次锁、停自有子进程，保留脱敏证据，禁止 029/030/真实 Run。若尚未执行 DDL，按已记录原状态恢复服务/任务；若 DDL 已开始，MariaDB 隐式提交且 030 旧唯一索引可能无法无损重建，不能自动 down migration 或删历史行，保持消费关闭并交项目经理单独决策。

最短下一步：项目经理让 QA 只读审查本页和生产入口缺口，再向用户分别申请“高权限 DBA 只读预检”与“服务/任务排空窗口”的授权；未批准前保持 `NO_GO`。

## QA 阻断补充

### 权限、身份、语句与审计矩阵

以下是设计矩阵，不是授权清单。实际权限必须由 DBA 在隔离环境用 `SHOW GRANTS` 验证，生产未执行。

| 阶段 | 连接身份/主机 | 最小语句白名单 | 所需权限边界 | 会话/审计输出 |
|---|---|---|---|---|
| 生产只读预检 | 经批准的维护 DBA 身份；固定生产主机到 `LIUFUYI-2-48:3306/public_opinion` | `SELECT CURRENT_USER(),CURRENT_ROLE(),@@hostname,@@port,@@server_id,@@datadir,VERSION(),DATABASE(),CONNECTION_ID()`；`SHOW GRANTS`/角色映射与 `information_schema.USER_PRIVILEGES`、`SCHEMA_PRIVILEGES`、`TABLE_PRIVILEGES` 有效权限审计；目标库 `information_schema` 聚合；`SHOW FULL PROCESSLIST`；`SELECT` `information_schema.innodb_trx`；`SHOW EVENTS`/复制状态只读查询 | 需要能看到全实例线程/事务的 `PROCESS`；目标库元数据 `SELECT`；不授写权限、DDL、`GRANT OPTION`。必须拒绝默认/继承角色带来的额外全局或库权限；此身份标记为 privileged，不进入最小观察脚本 | 只记录精确 `CURRENT_USER()`/`CURRENT_ROLE()` 是否匹配审批指纹、有效权限集合的脱敏分类、计数、年龄分布、用户/库/命令聚合和错误码；不记录 SQL 文本、凭据、连接 ID 明文或业务行 |
| 锁定与源清单 | 同一已批准 DBA 连接，独立 owner/watcher 会话 | `SET SESSION lock_wait_timeout=...`；`SELECT CONNECTION_ID()`；`FLUSH TABLES WITH READ LOCK`；目标库对象/Manifest 查询；`UNLOCK TABLES` | `FLUSH TABLES WITH READ LOCK` 的实际最小权限必须由隔离实测和 DBA 审核确认（通常涉及 `RELOAD`）；锁主不得复用业务连接；watcher 只读监视 owner 存活 | 审计锁请求/持有/释放时间、owner/watcher 角色、锁错误码和对象/数据摘要，不保存 SQL 正文 |
| 生产 dump | 同一窗口内的受控 dump 执行身份；固定 `127.0.0.1`/目标端口和数据库指纹 | `mysqldump --no-defaults --host=... --protocol=tcp --default-character-set=utf8mb4 --single-transaction --quick --routines --triggers --events --hex-blob --no-tablespaces public_opinion` | 目标库 `SELECT`、`SHOW VIEW`、`TRIGGER`、例程/事件读取及 dump 所需锁/元数据权限；不写业务库；实际 GRANT 由 DBA 先在隔离副本验证 | 只记录参数模板（凭据脱敏）、退出码、stderr 大小、字节数、SHA256、耗时和 artifact ID |
| 隔离恢复 | 全新 433xx/独立 datadir 的隔离 root 或专用 restore 身份，不连接 3306 | `mysql --no-defaults --protocol=tcp --default-character-set=utf8mb4 --binary-mode=1 < artifact`；恢复库对象/Manifest 查询 | 仅隔离恢复库 `CREATE/ALTER/INSERT/INDEX/CREATE VIEW/ROUTINE/TRIGGER/EVENT` 等对象权限；该身份和 datadir 不得复用于生产 | 记录隔离实例身份、退出码、对象/数据摘要、清理状态；不保留口令或原始业务行 |

所有阶段都必须固定 `--no-defaults`、TCP 目标、工具绝对路径、硬时限和最小证据目录；任何身份/主机/权限漂移立即失败关闭。`PROCESS` 的跨库可见性需单独审批，不能因“DBA”三个字自动放行。

### 第一段：DBA 高权限只读预检申请口径

该段只做元数据和状态查询，不停服务、不禁任务、不持 FTWRL、不执行 dump/restore/DDL。影响是维护 DBA 身份可看到全实例线程、事务和部分 SQL 元数据；它不是最小权限观察账号，也不改变数据库对象或业务数据。预计 2-5 分钟，查询总时长上界由项目经理预先批准，单条查询超时立即停止，不临时延长。

白名单仅包含：连接身份 `CURRENT_USER()`/`CURRENT_ROLE()`/目标指纹；`SHOW GRANTS`、角色映射及 `information_schema` 有效权限集合；`SHOW FULL PROCESSLIST`、`information_schema.innodb_trx`、目标库 Run/lease/heartbeat 聚合；全量 Windows 任务枚举与 allowlist 分类；Event Scheduler、复制/导入状态和服务状态的只读采样。输出只保存脱敏身份匹配结果、权限分类、计数、年龄桶、任务/服务状态、错误码和采样时间，不保存 SQL 文本、命令行、凭据、业务行或原始进程列表。

预检停止条件：`CURRENT_USER()`/`CURRENT_ROLE()` 与审批指纹不符、发现继承角色额外权限、出现写权限/DDL/`GRANT OPTION`、目标主机/库/版本漂移、任何任务未分类、查询超时、未知连接/写入者、脱敏失败或无法证明输出范围。任一条件即返回 `NO_GO`，不进入排空、锁库或备份；该段本身也不构成后续生产授权。

### 写入者全量盘点（只读聚合）

排空前必须同时采集以下类别，输出只保留数量、状态、最近时间和脱敏标识：

- WinSW：API、主 Worker、分析 Worker、翻译 Worker 的服务状态、PID、自动恢复配置和实际 release/build hash。
- Windows Task Scheduler：先全量枚举 `Get-ScheduledTask` 的任务名、路径、状态、动作和触发器，再按项目经理批准的 allowlist 分类（BigPlayer、PublicOpinion、Q1、Overseas 及明确的无关任务）。任何未分类任务、无法读取动作/触发器或 allowlist 漂移都立即阻断，不得只看两项已知任务。
- MariaDB Event Scheduler：`@@event_scheduler`、目标库 `information_schema.events` 的 enabled/status 聚合；触发器、例程和事件对象均纳入 Manifest。
- 外部连接与导入：`PROCESSLIST` 按 user/host/db/command 聚合，目标库连接和非目标库连接分开计数；外部 API、Discord/导入作业、一次性脚本和运维会话只记录存在性与脱敏 owner，不输出 SQL 文本。
- 复制/集成：只读检查 `SHOW SLAVE STATUS`/`SHOW REPLICA STATUS`（版本可用性按实际返回判断）、`SHOW MASTER STATUS`/binlog 状态和已知同步服务；未知复制或外部集成即阻断。
- 数据库状态：活跃 `po_sync_runs`、schedule/worker lease、heartbeat、checkpoint 写入窗口和两次全局写入计数；无法读取全局计数时显式标记 blind spot，不按零处理。

上述类别任一无法盘点、出现未知写入者、未提交事务或持续写入，即 `NO_GO`。停止服务/禁任务动作必须记录原状态、进程/任务标识、恢复命令和验证结果；本轮不执行。

### 排空与锁耗时硬停止

窗口上界不能凭经验填写，必须先用同版本、同对象规模的隔离负载测量并记录 P95/P99，再由项目经理批准数值。生产执行时分别计时：新写入阻断、排空等待、锁获取、锁持有、dump、隔离恢复、总窗口。任一阶段超过批准上界、磁盘低于阈值、watcher 失联、锁主变化、未知写入者出现或子进程退出未确认，立即中止并释放本次锁；禁止临时延长、强杀未知进程或自动重试。

### 生产入口分阶段实现（默认关闭）

1. `production-preflight`：只读身份/权限/写入者/容量盘点，固定输出 `NO_GO` 或缺项；不接受生产连接串，不创建账号，不调用 dump。
2. `production-authorized`：仅在用户批准维护窗口、DBA 身份、目标指纹、候选 SHA、时间上界和审计范围后生成一次性授权材料；材料不含口令，默认过期，独立 QA 复核后才可进入下一阶段。
3. `production-execute`：当前代码继续固定 `PRODUCTION_EXECUTION_DISABLED`。未来实现必须在隔离 fake executor、错误/超时/清理故障注入和 ACL 测试全部通过后，由独立 QA 复核；任何缺项仍失败关闭。

### 029/030 分段批准与回退

029 与 030 均可能隐式提交，不能依赖事务 `ROLLBACK`。必须在 DDL 前分别取得用户批准并保存前镜像/结构基线；先执行 029，独立核验定义、ledger、索引和历史字段，再重新取得 030 批准并执行 030。任一段失败或部分完成，立即保持所有 BigPlayer 消费关闭，不自动补偿、不删除历史、不猜测 down migration；项目经理根据已完成 DDL 和备份可恢复性决定继续修复、整库恢复或放弃窗口。DDL 后只有在 029/030 双段核验、同版 API/Worker 验收和新的写入者/lease/事务盘点均通过后，才可单独申请站点对齐事务与真实 Run。

隔离门禁当前已有：生产入口零连接 `PRODUCTION_EXECUTION_DISABLED`、非法隔离身份/路径零连接拒绝、43317 真实 dump/严格恢复、数据/对象变异拒绝、锁/恢复/清理硬时限和端口释放。最新隔离 E2E 为 `PASS_ISOLATED_EXECUTOR_E2E`：51 项执行器/Gate/Manifest 单测通过，锁持有 237ms，dump 9,067 字节，数据/对象变异拒绝，清理和 43317 释放通过；脱敏证据为仓库上级 `.temp/po-closeout-20261008/snapshot-executor-isolated-4pZqTc/`，dump SHA256 `487c7bcb6fd8dea3f7f095c26d513c9ca69e49fca49bd2814f932d7bac0fac73`。它们只能证明隔离边界，不能替代上述生产权限、写入者、体量和 DDL 分段门禁。
