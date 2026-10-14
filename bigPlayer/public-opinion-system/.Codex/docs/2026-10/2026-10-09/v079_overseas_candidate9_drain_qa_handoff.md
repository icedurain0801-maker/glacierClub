# 候选9排空生命周期交接

Status: frozen / developer-PASS / independent-QA-pending / runtime-NO_GO

一句话需求：验收海外候选显式 runtime 的 scan/task/poll 排空与 scheduler 等待竞态门禁，不激活生产。

已拍板决策：沿用海外专属授权与主链接线隔离方案；国内和默认共享worker路径不变，旧代码/快照零删除，仅当前模型。不得现役进程操作、生产DB/配置修改、真实HTTP、登录刷新、DDL、push或发版。

文件路径：仓库根 `.temp/overseas-qa-candidate9-20261009-01`；本项目 `.Codex/docs/2026-10/2026-10-09/v078_overseas_candidate9_drain_frozen_manifest.json`；变更v076、v077；重点worker/src/worker.js、workerDrainController.js、workerCandidateRuntime.js与worker/test/workerDrainIntake.test.js、workerUnifiedSchedulerSeam.test.js。

请测试负责人执行：仅冻结快照，校验manifest列明637份文件测试前后SHA；运行manifest的11文件node --test命令（开发78/78）。重点schema query等待drain后runJob零调用；已admitted写阶段完成再release；manual CAS/poll等待期间drain不新增任务；shutdown等commit、租约/poll清理再关闭session/pool；无controller旧baseline。报告独立通过数、hash数及剩余NO_GO，并回报开发负责人和项目经理。不得编辑快照。

明确未完成：manual CAS清marker到持久queued run尚非原子，故不能证明崩溃不丢单；全入口生产接入/独占消费者、可信当前观察与epoch持久恢复、第二源board/registry修复、真实DB/HTTP/AI/翻译/定时槽仍未验。此候选仅局部fixture PASS，不是可上线交付。
