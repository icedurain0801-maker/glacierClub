# 分析解耦与清理预览

Status: 实现与单测通过，未部署，运行态验收未通过。清理只读，未获执行授权。

## 变更

- worker/src/worker.js：普通分页及 legacy 采集只入队；runOnce 只补漏，不消费分析。
- worker/src/analysisWorker.js：空队列常驻，独立串行消费；每轮持 MySQL `po-analysis-consumer` gate；取消循环自动质量清理，显式函数仍保留；一分钟输出队列指标，信号停止后关闭连接池。
- worker/src/q1DailyAnalysisRunner.js、dailyRunner.js：精确分析流程持同一 gate；忙则失败，不降级进程内锁。长 Q1 流程会暂停全局消费，这是范围隔离的保守取舍。
- server/src/db/repository.js：持 gate 的领取先验证数据库连接仍拥有锁；保持近 7 天优先组内 FIFO（最新派单覆盖先前全局 FIFO 要求）。
- countAnalysisJobs：有效内容及启用来源范围内统计可领取 pending、到期 retryable、过期 running；runningActive 单列。孤儿按当前 profile/version、全部 active、全部状态分别告警，不纳入正常等待 SLA；检查 FK DELETE_RULE。
- admin/PublicOpinion/assets/content.js：有效积压、最老等待、近五分钟完成、孤儿和历史饥饿独立展示。页面缓存版本尚未变更，后续部署需同步；不把工作树修改当已部署。

## 验证

- analysisWorker/q1DailyAnalysisRunner/dailyRunner/repository：158/158 PASS。
- Worker 原完整 80 测 78 PASS，2 项要求旧同步分析行为。修改为入队合同后这 2 项及失败重试相关定向共 4/4 PASS；未重复完整 Worker 回归。
- 新 SQL 合同覆盖 limit=10、唯一 claimOwner、到期 retryable/运行租约重新领取、finish 旧 owner fencing、gate 连接丢失 fail-closed。
- 新消费者测试覆盖空队列常驻、单轮互斥、异常释放、gate busy、Q1 busy。恢复领取是单测/SQL 合同证据，不是实际重启运行证据。
- 语法检查 PASS；定向 diff whitespace 检查 PASS（仅有 CRLF 提示）。

## 监控观测与 SLA

新版方法直接只读实测：pending=6467，queueDepth=6467，runningActive=0；oldestWaitingAt=2026-09-18 12:10:21，oldestWaitingSeconds=8549；completedLast5m=10，throughputPerMinute=2；light/sentiment-v1 orphan=31010。

这只是单次快照，不承诺稳定吞吐。`AI_ANALYSIS_WAIT_SLA_SECONDS` 可配置等待目标，未配置时 waitSlaSeconds/waitSlaBreached 均为 null；目标需项目经理确认。建议先观察新消费者下连续多个五分钟窗口，再评估目标；本次不改额度、并发或配置。7 天历史饥饿仅告警。

四条精确恢复已由 QA PASS，详见 v005 和 `.tests/2026-09/2026-09-18/v209_p0_exact_analysis_readonly_acceptance.md`；不重复消费。

## 2026-09-11 日界清理只读预览

| 批次 | 条件 | 任务数 | distinct content_id | 活动租约 |
|---|---|---:|---:|---:|
|有效内容|pending 且 published_at < 2026-09-11 00:00:00|0|0|0|
|孤儿|pending 且 job.created_at < 2026-09-11 00:00:00|31012|31012|0|

孤儿 light/sentiment-v1=31010、deep/sentiment-v1=2。日期分布：08-28=10072、08-29=19977、08-31=300、09-01=62、09-02=601；最老08-28 20:54:36，最新09-02 19:05:28。由于内容已缺失，社区/内容类型不可恢复，分布待外部备份补证，不能虚构。

UUID词典序摘要 min=0141b4bc-6e1f-4d20-8450-0d7ea8395f36、max=fffefe1e-7ad5-4ba8-ac4f-537eadd5db57，仅摘要，不是连续删除范围。另有 completed 孤儿102408、failed孤儿1507，不在本次 pending 清理范围。

session time_zone=SYSTEM，system=Asia/Shanghai；published_at 若实际按 UTC 存储，北京日界需转换为09-10 16:00:00，待确认。有效批用更宽原阈值已为0，收紧仍0；job.created_at 默认 NOW 的时间语义须独立确认。

## 参照一致性审计

当前 FK po_analysis_jobs_content_fk→po_contents(id)，DELETE_RULE=CASCADE，session FOREIGN_KEY_CHECKS=1。定义在 migrations/008_tiered_ai_analysis.sql。

正式删除入口 Repository.deleteSyncRun 有事务和 sync_run_deleted 审计；历史提交42c0349也有该行为，代码未发现关闭 FK 的入口。迁移008应用08-13 17:09:20；jobs CREATE_TIME同刻，contents CREATE_TIME08-27 17:46:04，仅DDL时间线，不能推断重建或清表原因。

08-28至09-02审计0行，全库 delete/clean/migrate类审计0行；log_bin=0/general_log=0。只能确认历史参照异常，尚不能定位实际绕过入口。需要历史备份、外部SQL记录和运维日志；已补在线只读FK/孤儿一致性告警，未自动修复。

## 二次确认后的清理方案（未执行）

1. 项目经理确认清理 light 31010 还是全部 pending 31012，时间语义及精确ID清单；有效0不执行。
2. 导出完整原始job行、schema、精确ID manifest及校验哈希到受控快照；在隔离库先测试恢复。备份表无原FK，只用于审计保存，不是自动绕过在线约束。
3. 单连接 START TRANSACTION，按manifest JOIN锁定待删任务；重验pending、时间、无owner、无活动租约和关联缺失；数量变化立即ROLLBACK。
4. 仅删除与manifest相等且满足原条件的job，不删content，不动非pending。写本次审计后才COMMIT。禁止按UUID min/max删除。
5. 提交前失败ROLLBACK；提交后保留完整快照并核对计数。**在线恢复孤儿会被当前FK拒绝**，不能承诺直接INSERT回滚，禁止在线关闭FK。需要先验证隔离恢复，并另行确认一致性恢复方案，否则不可执行清理。

候选SQL仅作为待审批设计，表名/精确清单由审批批次确定，不得现在执行：

```sql
START TRANSACTION;
SELECT j.id FROM po_analysis_jobs j JOIN approved_job_manifest m ON m.id=j.id
LEFT JOIN po_contents c ON c.id=j.content_id
WHERE j.status='pending' AND j.created_at<'2026-09-11 00:00:00'
AND c.id IS NULL AND j.lease_owner IS NULL
AND (j.lease_until IS NULL OR j.lease_until<=NOW()) FOR UPDATE;
-- Recheck the manifest count and approved backup before this deletion.
DELETE j FROM po_analysis_jobs j JOIN approved_job_manifest m ON m.id=j.id
LEFT JOIN po_contents c ON c.id=j.content_id
WHERE j.status='pending' AND j.created_at<'2026-09-11 00:00:00'
AND c.id IS NULL AND j.lease_owner IS NULL
AND (j.lease_until IS NULL OR j.lease_until<=NOW());
-- COMMIT only after affected-row verification and audit; otherwise ROLLBACK.
```

## 交付门禁

未部署/重启/删除/提高额度，未取得新版消费者采集期间持续消费、实际重启恢复及稳定吞吐证据；整体 P0 不判通过。翻译Worker另线由开发员工准备方案，尚未触发翻译或报完成。
