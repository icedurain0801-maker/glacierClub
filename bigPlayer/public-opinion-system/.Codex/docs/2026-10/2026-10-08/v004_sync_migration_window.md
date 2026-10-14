# 同步迁移候选：生产窗口方案（未执行）

Status: pending-independent-qa

本文件是交项目经理及独立 QA 的执行方案，不是生产操作授权。本轮不执行生产 DDL、服务切换、真实同步、提交或推送。

## 版本及影响

- 审计基线：MariaDB 10.4.14，33 张表，仅复制 SHOW CREATE 与迁移文件名到隔离实例；不复制业务数据或凭据。基线 SHA256：`3923ac89b7eed99ae72c8d76f344e1e70f9abf84a2ca3910df5c66eda76e5705`。
- 现网 API v019 / Worker v055 不能只补数据库就开放 BigPlayer。旧 Worker 不限制配置 board，且不写 board_id、不遵守站点 URL 快照。应将本次同版完整 API/Worker 候选作为一个窗口验证，不得把 Token 小补丁部署等同完整候选部署。
- 030 的 stored generated column 与唯一索引可能重建表、等待 MDL，并影响 Discord、国内来源及所有写 po_contents 的程序。表行数约值不能用作数据保护校验。
- 当前仓库统一准入对 030 的检查是全局门禁，缺 030 会拒绝其他平台的统一入队。维持该既有保护，本单未改成按平台放行；窗口应统一控制准入。

## 境外 BigPlayer 站点身份阻塞（2026-10-08 只读复核）

本节补的是既有 Last Night 修复的业务准入门禁，不是生产配置修改授权。只读事务仅查询两条指定 source 的配置形状、registry 与最近 Run 时间；未打印 URL、凭据或业务行。

| source | 当前形状 | 预期准入结果 |
|---|---|---|
| Last Night `081a16d2-5545-4afd-9c65-e04777e4540b` | enabled/authorized，`boardId=100017`；config 有 3 个启用的 `site-*`，registry 仅 1 个启用的 `legacy-*`；首站 URL 相同但 ID 不同，其余两站无 registry 行；最近 Run 为 2026-09-21 14:34:32 | 手动/定时多站点均因 `siteId + URL` 不精确匹配而 `MULTISITE_SITE_REGISTRY_MISMATCH`；029/030 和同版 Worker 通过也不能自动解除 |
| 邻近 source `8c690d6e-12ea-4ad3-b434-d941276c4906` | 同样是 config 3 站/registry 1 个 legacy 站，但 config 缺 `boardId`；最近 Run 同为 2026-09-21 14:34:32 | 先由 `BOARD_ID_REQUIRED` 阻断；不得猜填或复用 Last Night 的 `100017`，本窗口受控真实 Run 不包含此 source |

Last Night 的最小对齐候选：先以 `(source_id, 规范化 URL)` 对照，要求当前 registry 的 legacy 站与 config 的**唯一一项**同 URL，并核对历史 Run/checkpoint 对该 `legacy-*` 的引用。仅将该 config 项的 `siteId` 改为现存 `legacy-*`；其余两个 config `site-*` 的 ID、URL、enabled 保持不变，并为它们新增对应 registry 行。最终应是 3 个 config 站与 3 个启用 registry 站逐项精确一致，3 个子 Run 全部绑定本 source、`boardId=100017`，首站继续沿用 legacy cursor。若同 URL 映射不唯一、出现其他 registry 行/历史引用、boardId 或配置变化，停止而非猜测修复。

生产写集合仅拟为该 source 的 `po_sources.config` 一行与 `po_source_sites` 两条新增行；不更新现存 legacy 行的 `site_id`/URL，不改 `po_sync_runs`、`po_sync_checkpoints`、凭据、账号或其他 source。通用 `updateSourceConfiguration` 会连带写显示名、频率、账号元数据并重对账 registry；不能只传 `siteUrls` 盲存，更不能原样保存当前 `site-*` 配置（会触发 `MULTISITE_SITE_ID_CONFLICT`）。如将来获生产授权，须先有经独立 QA 审核的专用、带前镜像和精确行数断言的单事务执行/回退脚本；本轮不编造生产 SQL 或直接写库。

顺序：先满足本文件的同快照可恢复备份、排空与 029→030 迁移门禁，再验同版 API/Worker；在消费继续停止的状态下执行另行批准的站点对齐事务，复核源 config、3 个 registry 行、历史身份不变及无活跃 Run/lease，之后才可申请 Last Night 单 source 的受控真实 Run。事务提交前失败直接 ROLLBACK；提交后若尚无新 Run，可用保存的前镜像在另行批准事务中恢复原 config、禁用仅本次新增的两行（不删除），继续保持同步关闭；若已有新 Run/历史引用，禁止自动反向改键或删除，转项目经理单独决策。029/030 DDL 本身不随该事务回滚。

## 窗口前硬门禁

1. 独立 QA 核验 manifest、完整原始日志、同版构包，确认候选与测试对象一致。获得项目经理组织的单独生产授权后才能进入以下步骤。
2. 重新只读确认实际数据库主机/端口/库名、版本、迁移 ledger、SHOW CREATE；核对完整文件名：023_unified_source_scheduling.sql → 025_worker_scan_leases.sql → 026_scheduler_runtime_schema_reconciliation.sql → 027_bigplayer_multisite.sql → 028_bigplayer_scheduled_site_runs.sql → 029_bigplayer_site_run_evidence.sql → 030_bigplayer_board_scope.sql。024 与另一份 028_translation_call_budget.sql 不得替代这里的前置迁移。
3. 029/030 runner 校验的是前置文件名、site_id 以及029/030目标列/索引，并非023–028所有结构。必须另外比对023–028的表、列、checkpoint站点身份索引、028 trigger CHECK、外键与审计基线；有漂移即停止，不重放历史回填迁移。
4. 只读检查 `SHOW FULL PROCESSLIST`、`SELECT * FROM information_schema.innodb_trx`、活跃 Run/checkpoint/Worker 心跳。活跃状态必须现场刷新，不能复用上次 API 重启时的 Discord 结论。
5. 经授权排空或暂停所有共库写入者和准入，包括独立 Worker、Discord、API导入及计划任务；记录精确服务/进程、旧构包、外置配置引用和恢复动作。不存在可凭空启用的 BIGPLAYER_API_SYNC_ENABLED 开关。
6. 在写入停止后，由生产执行人员获取可恢复的数据库备份并验证恢复方式、磁盘余量；记录三张关键表 po_contents / po_sync_runs / po_sync_checkpoints 的准确计数及原有列的确定性分批摘要。未经备份验证不执行 DDL；不把隔离人工数据演练当作生产体量耗时证明。

## 迁移与停止条件

在已核实数据库身份、加载批准的外置环境且包含 migrations 的冻结源目录，由生产执行人员分别执行（本文不执行）：

```powershell
node server/src/db/migrate.js 029_bigplayer_site_run_evidence.sql
if ($LASTEXITCODE -ne 0) { throw '029 failed: stop window' }
node server/src/db/migrate.js 030_bigplayer_board_scope.sql
if ($LASTEXITCODE -ne 0) { throw '030 failed: stop window' }
```

禁止无参数跑全库迁移，禁止裸 SQL 绕过 runner 的同名定义检查，禁止仅插入 ledger。runner 限制 lock_wait_timeout / innodb_lock_wait_timeout 为10秒，仅限制锁等待，不是总耗时上限。生产观察员遇到身份不符、结构漂移、写入者未停止、锁等待失败、磁盘告警或窗口超时立即停止后续步骤，保留现场并交项目经理决策；不要盲目重试或杀未知进程。

执行后复核029/030实际定义和ledger、旧列摘要/计数不变、历史新增快照/board字段保持NULL、board_key为legacy，新唯一索引存在且旧两个唯一索引已移除。再部署并核验同版API/Worker包、入口路径、依赖manifest及实际进程命令行。所有验证完成前不恢复BigPlayer消费。

## 回退边界

- MariaDB DDL 隐式提交；失败可能保留部分结构，不能通过 ROLLBACK 撤销。记录每条已完成DDL，解决原因后仅用同版runner受控重跑。
- 030先建新唯一索引再删旧索引；新索引失败不会先丢弃旧保护。同名错误索引由预检拒绝，不自动替换。
- 一旦允许跨board相同external_id或同正文不同ID，旧唯一索引可能无法重建。没有通用无损down migration；禁止DELETE去重、禁止强行加旧索引。完整库恢复也涉及窗口内写入损失，必须另行决策。
- 应用回退通常保留新增schema，但旧Worker不能重新消费BigPlayer；继续停止该消费并协调修复。若无法确保平台隔离，保持旧Worker停止，不能默许混跑。
- 真实 Last Night 增量Run、实际上游抓取及AI调用必须另行授权；独立QA与本地模拟通过不能宣称生产同步PASS。
