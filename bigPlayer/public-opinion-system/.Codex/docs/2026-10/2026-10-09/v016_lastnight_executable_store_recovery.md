# 可执行 Store / 精准恢复子阶段

Status: QA_PENDING / NOT_DEPLOYED。

沿现役legacy列，无DDL。queue/restore总deadline覆盖取连接/SQL，超时毁自有连接；COMMIT已发但ACK未知准确单列，不当回滚。completed旧fingerprint仅在content+job同事务FOR UPDATE且无running/lease时，复用既有enqueue force:true精准重置该job；其他force:false，同fingerprint completed保留，不夺有效lease。

CLI移除通用QA_NOT_RELEASED，仍必须approved计划+完整hash+identity/固定DB/绝对输出绑定；支持store-ai、restore-content、requeue-exact、observe-ai。候选可离线QA但现场仅由经理QA GO后串行执行，未自行执行。

已成功9条报告只有ID和诊断，没有正文/完整raw。因此不能直接复用报告入Store。经理Store现场需要最少必要同一天单站首页一次有界重读（context/board/首页/窗口内详情≤20，总≤24），复用已验证direct合同，不再单独metadata盲探测；重读内容仅内存，原行/后行journal加密，脱敏report无正文。若无窗口样本EMPTY_SAMPLE不算PASS。

索引只读核验由经理一次执行：
```sql
SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_list
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('po_contents','po_analysis_jobs','po_content_feed_memberships','po_sync_runs')
GROUP BY TABLE_NAME,INDEX_NAME,NON_UNIQUE;
```
必要性：确认source+external唯一、分析content/profile/version唯一、membership身份唯一、日slot source+scheduled唯一；005曾删除source-fingerprint索引，不推测实际存在，不改索引。

日采集/持久slot兼容/02正式入口仍未完成，国内PASS冻结。

增量验证：35/35离线测试PASS，含真实Repository legacy写SQL、TLS/授权读链、依赖全清单、队列/恢复总deadline、COMMIT未知、CAS冲突、stale completed精准重排、running零覆盖、AES-GCM journal认证/篡改/prepared拒绝、partial schema负例。stage返回精确成功码，requeue成功仅表示入队，observe/store未完成AI仍非零；requests可选不引发TypeError。

失败恢复：Store提交前失败不入队；COMMIT未知仅保留prepared journal供经理精确只读核验，不自动回滚/重抓。已提交且队列失败按journal精确IDs重入队，不删历史。任一已有AI job阻断正文回退，入队后前向恢复。observe只读绑定job/content/fingerprint/version，deep覆盖light导致证据不足时明确未完成。

| 子阶段 | 交付状态 |
|---|---|
| store-ai | 可执行候选，需QA GO与经理绑定一天窗口/索引实证；AI未完成非零 |
| requeue-exact | 可执行候选，需已提交认证journal；不抓上游 |
| observe-ai | 可执行只读候选，需queue_result journal；不新consumer |
| restore-content | 可执行局部恢复候选，CAS/job冲突拒；保留新增历史/membership |
| 独立QA与经理现场 | 待新稳定冻结验收，未执行 |
| 日分页/slot现役兼容/02入口 | 未完成，另行继续 |

最终稳定冻结：仓库根 `.temp/bigplayer-recovery-20261009/lastnight-runtime-8fcFb4`，完整manifest、candidate.cmd、metadata及四个stage未批准模板。替代全部此前中间包；交QA后不再改该候选源码，发现缺陷另明确撤回并新冻结。

| 文件 | SHA256 |
|---|---|
| scripts/lastnight-bounded-runtime.js | 728a952ab5622dbc2fdab5359d0c5971b509d9dc70e8a4bf3975af538eefe05e |
| worker/src/lastNightProtectedStore.js | 7e9ab28d9f5949893e166ac5e1d11639e283fcf01be3e59687bacaa97f7c641a |
| worker/src/lastNightRecovery.js | 7827b4188c905716cea613477d01d2a6183b19b327a73bb97186a116e8c2415f |
| worker/src/lastNightDeadlineConnection.js | 107caea3b4e884ada04cdc3776d9cc77b2589334be1beb5d377c11039317849e |

验证命令：`node --test worker/test/lastNightRecovery.test.js worker/test/lastNightRecoveryTransactions.test.js worker/test/lastNightProtectedStore.test.js worker/test/lastNightLegacyContentContract.test.js worker/test/lastNightWriteSchema.test.js worker/test/lastNightBoundedRuntime.test.js worker/test/lastNightTransportSafety.test.js worker/test/lastNightReadonlyGuard.test.js server/test/lastNightRuntimeInventory.test.js server/test/lastNightAuthorizationCheck.test.js server/test/lastNightSiteSession.test.js` 35/35 PASS；语法/空白检查通过，新模板verifyInventory通过。无现场DB/外部请求/任务修改。
