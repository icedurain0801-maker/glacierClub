# Last Night 同步入队迁移门禁修复

Status: frozen-pending-independent-qa

## 原因与现网漂移

只读采集生产33张表的结构与迁移文件名（不复制业务记录/凭据），MariaDB 10.4.14；023/024/025/026/027、两份028已登记，029/030缺失。API v019在多站点准入要求029，因此入队前拒绝；运行列表又引用030缺失的community_id。Token检测通过不等于同步准入通过。

Worker v055独立运行，但不遵守board范围：遍历全部boards、内容查询未限定board、不写board_id。仅补DDL后让旧Worker消费BigPlayer不安全；需配套board-aware API/Worker候选验证与部署。活跃Discord直接写po_contents，数据库DDL窗口不同于先前API单独重启窗口。

## 当前修改

- 030先建新唯一索引，再删旧external/fingerprint索引，避免新索引创建失败后无唯一性保护。
- 迁移runner对029/030校验完整前置文件名、现有同名列/索引定义、生成列表达式；执行后验证再登记ledger，已登记亦复核。会话锁等待限制10秒，不能将其解释为DDL总时限或无阻塞承诺。
- API/Worker board readiness增加旧唯一索引已移除校验，防残留旧索引继续限制跨board同externalId。
- API发布脚本与验证器纳入bigPlayerBoardSchema.js，修复当前完整API候选包依赖遗漏。
- 尚未执行生产迁移、真实Run、服务变更、提交或推送。Last Night前单未提交Token修复保持原样，不覆盖。

## 完成的验证

- 夹具改用changeUser切库以清空mysql2预编译语句缓存，解决第二个隔离库写到前库导致ledger重复的问题；清理仅在port/server_id/datadir全部匹配后执行SHUTDOWN，否则只回收自己启动的child。
- 同名普通列额外拒绝生成列及非NULL默认值，防止快照字段不可写或board默认值污染。
- 最终隔离演练`migration-shape-r6.log`退出码0：029两条与030六条SQL逐点中断重跑；旧内容id/body/fingerprint/external_id投影保留；错误列/生成表达式/默认值/同名索引拒绝；锁等待10015ms失败无ledger、释放后重跑；真实Repository目标source-o/board100017入队、真实Worker syncStage与Repository持久化、AI任务入队；国内与Discord夹具内容计数不变。跨board同external成功，同board重复拒绝，恢复旧unique失败且不删数据，已登记但缺索引时重跑仍拒绝。
- 演练过程中r3/r4/r5的租约失败来自夹具未完成真实claim、缺账号关联、未使用claim返回的精确lease_owner，均已按业务正常流程修正，未放宽租约校验。所有失败日志保留供审计。
- 最终Server全量518/518，Worker全量277/277，退出码均0。原始日志：仓库根`.temp/po-closeout-20261008/migration-server-final.log`、`migration-worker-full.log`。
- 同版完整API包397文件、Worker包410文件，各自依赖与manifest验证通过。构包位于上述临时证据目录`api-migration-frozen-r1`和`worker-migration-frozen-r1`，不在生产运行目录。
- 本轮变更8个已有文件、新增validator/隔离演练/本文与窗口方案；上一单Token connector/测试/v002文档仅作为构包依赖单列，不混入迁移推送授权。

## 验证边界与下一步

交独立QA，不自判同步PASS。人工夹具不是生产数据量压测；AI只证明任务持久化，未调用真实模型；未覆盖生产网站登录/抓取、完整调度循环或真实多站点子Run。历史内容验证是上述四列投影，生产窗口必须另做全原有列摘要。runner不是023–028所有结构审计替代品，必须执行窗口前独立结构核对。生产窗口及回退方案见同目录`v004_sync_migration_window.md`。禁止自动删重或仅写ledger伪造迁移完成。
