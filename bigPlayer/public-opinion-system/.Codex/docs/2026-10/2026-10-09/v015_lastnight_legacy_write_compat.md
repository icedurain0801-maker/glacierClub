# 现役无 board 列的海外 Store 兼容

Status: IMPLEMENTING / NOT_RELEASED。

经理现场已确认 contents 无board_key/board_id但有source/account/community/raw_payload/external/fingerprint；run缺可选board/community/site快照列。采用兼容，不DDL，不新库，不重抓已成功样本。

Store识别legacy_source_external：沿既有source+external唯一键，原行FOR UPDATE，严格account/game/community并核payload已知board；foreign或无法证明board的原行拒绝覆盖。新增raw_payload写_lastNightScope固定身份/board100017，membership保留固定merged feed。复用现有upsert算法，输入不带缺失board字段，仅专用SQL适配移除不存在的board_id/board_name列、对应参数和更新项，不修改共享Repository。

队列/AI观测legacy查询不使用board列，绑定source/account/game/community，检查payload board marker。journal继续加密原行/后行，commit未知不当回滚。

未完成：legacy CAS补偿/精准重入队CLI、真实schema SQL集成负例；日slot实际列兼容另行继续，当前不现场Store/daily。国内冻结。

增量：legacy CAS不读写board列，仅恢复原行实际存在列，整行CAS/身份/AI冲突保护保留；补偿仅恢复内容，不删除新增历史或membership。新增同一独立CLI的restore-content/requeue-exact/observe-ai候选，从绑定SHA的AES-GCM journal认证读取，限定仓库根temp、account/source/board、committed阶段；不抓取上游，未知commit不可恢复。当前QA前CLI写/恢复阶段仍明确禁止，不能执行候选。

7/7定向fixture PASS，包含真实Repository _upsertContentPageAttempt执行legacy SQL（每条SQL断言无board_key/board_id/board_name），payload marker与固定membership保留；纯fixture非现场。日执行兼容随后，真实AI完成待现有消费者证据。

员工补充可能存在source+fingerprint唯一键的风险：005已有drop该索引，现场实际索引待确认，不把030未应用当该索引存在证据。候选保守新增同批fingerprint去重及事务内source+fingerprint FOR UPDATE，遇不同externalId冲突拒绝；检查全部既有membership的board异值，upsert后再核实际external身份。无迁移变更。

最终增量30/30离线测试PASS，写/恢复CLI仍QA_NOT_RELEASED，尚需补偿/queue总deadline、认证journal恢复负例、既有AI旧completed精准重排与现役unique索引证明；不以这些本地结果宣布现场可写。日slot兼容尚未完成。

员工末轮收口：补偿COMMIT丢ACK明确UNKNOWN；部分board列存在但不齐拒绝，不误归legacy；提交前强制每输入有实际返回行，禁止稀疏Store结果提交。定向7/7复测PASS。新冻结根 `.temp/bigplayer-recovery-20261009/lastnight-runtime-VihCyj` 替代中间Tgsgk0，仅离线QA，不可现场写。
