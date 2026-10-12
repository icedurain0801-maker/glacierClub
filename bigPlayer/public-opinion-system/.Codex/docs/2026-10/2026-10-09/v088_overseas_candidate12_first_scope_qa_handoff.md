# 候选12首次scope恢复局部QA交接

Status: frozen / developer-97-PASS / independent-QA-pending / RUNTIME_NO_GO

一句话需求：独立验证可信receipt恢复未claim全站owner-free首次scope、原factory组装及实际Journal首epoch发布门禁，不宣称跨进程采集恢复完成。

已拍板决策：隔离当前模型、不动现役/生产/真实HTTP/DDL/登录刷新/第二消费者、不push发版、旧快照保留，合并pending marker口径。

文件路径：仓库根 `.temp/overseas-qa-candidate12-20261009-01`；本项目v087 manifest、v086变更；worker/src/overseasManualFirstClaimRecovery.js及worker/test/overseasManualHandoff.test.js。

请对方做：冻结快照641SHA前后，manifest12文件测试（开发97/97）；审trusted receipt+explicit requestIds+manifest→actual Repository对账accepted→第二READ ONLY快照全部scope/window、queued attempt0 epoch0且owner/lease/retry/start/finish严格NULL，重复request/run拒；恢复入口无claim/网络/Journal写，factory拒混入initial权限。fixture首次claim ACK后actual manager以真实Journal发布/epoch1读取，epoch2缺证拒绝。普通main未接入。

明确未完成：测试模拟persisted claim ACK，不是recovered factory→actual runSource组合E2E，也不是新进程执行SQL/HTTP；并发抢先claim证据、多站部分完成余量、epoch>1恢复/现役独占/真实MariaDB及第二源真实链路均未闭合。请保持PARTIAL_FIRST_SCOPE_PASS / RUNTIME_NO_GO，回报开发负责人和项目经理。
