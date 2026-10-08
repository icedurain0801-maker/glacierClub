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
