# 候选10 manual事务核心独立QA交接

Status: partial-offline-candidate / developer-88-PASS / independent-QA-pending / RUNTIME_NO_GO

一句话需求：独立审查实际Repository同连接事务“全部海外站点入队后CAS清marker”的核心实现及失败关闭worker候选分支，不将它作为完整durable交付。

已拍板决策：仅隔离、当前模型、现役/生产不动、无第二消费者、旧快照零删除，不真实HTTP/DB/DDL/登录刷新，不push发版。窗口规则沿国内，不变需求。

文件路径：仓库根 `.temp/overseas-qa-candidate10-20261009-01`；本项目v081 manifest；server/src/db/overseasManualHandoff.js、repository.js；worker/src/worker.js；worker/test/overseasManualHandoff.test.js、workerDrainIntake.test.js；v080变更。

请对方执行：校验manifest 639份前后SHA，仅冻结快照运行manifest12文件命令（开发88/88）。审实际Repository新方法调用同conn begin/source/account/credential/site/run锁、全站insert/read→CAS→commit；故障注入回滚/commit未知/重复terminal及新marker/精确scope冲突/模拟并发。断言无缺列写入、无INSERT IGNORE或terminal重置、无controller普通baseline。独立结果回报开发负责人和经理。

必须维持未完成：receipt.read是注入接口，无持久receipt发布/恢复实现；固定window未有DB anchor+各站board游标权威证据；ACK未知虽不盲重试但完整只读reconcile未实现；首次合同授权重启/epoch恢复未闭合。worker hook未与此Repository自动接通，无hook候选海外拒绝，不清marker。queued可见不等于可恢复执行。旧marker无request版本，只能合并pending，不保证逐点击exactly-once。真实链路及全入口独占、第二源仍NO_GO。
