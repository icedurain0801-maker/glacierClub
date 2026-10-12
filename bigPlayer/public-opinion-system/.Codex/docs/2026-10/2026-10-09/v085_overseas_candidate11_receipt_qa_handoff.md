# 候选11持久receipt/DB窗口/只读对账交接

Status: frozen / developer-93-PASS / independent-QA-pending / RUNTIME_NO_GO

一句话需求：独立验收file receipt真实读写/新进程读恢复、实际Repository DB权威prepare与handoff重验及unknown只读对账的局部候选。

已拍板决策：仅隔离当前模型、旧快照留存、现役/生产/真实HTTP/DDL/登录刷新/第二消费者不动，不push发版。pending marker合并口径，不承诺逐点击exactly-once；准入时快照不是点击历史快照。

文件路径：仓库根 `.temp/overseas-qa-candidate11-20261009-01`；本项目v084 manifest、v083变更；worker/src/overseasManualReceipt.js；server/src/db/overseasManualHandoff.js、repository.js；worker/test/overseasManualHandoff.test.js。

请对方做：仅冻结快照校验640份SHA测试前后，运行manifest12文件命令（开发93/93）。重点真品牌reader拒注入回调，root.temp canonical wx/fsync/link与fresh Node file recover；prepare同conn读取DB anchor+逐站board completed checkpoint原始集合hash（无历史site=null降级）；handoff固定window/重验cursor、全站事务CAS；reconcile RR READ ONLY快照仅SELECT业务表+rollback，accepted不清新marker/不重置terminal，allnone+same marker仅not_committed，partial/conflict unknown无补写。SQL/HTTP为fixture，文件真实；原始console在快照snapshot-raw.txt。

明确待续：新进程只读receipt≠首次run合同授权跨重启完成；主链接线/epoch恢复及全入口独占未闭合。真实MariaDB隔离、目录断电保证/TOCTOU全矩阵、第二源/真实链路仍NO_GO。请独立结论按本批局部范围，回报开发负责人和经理，不写“整链已恢复/真实运行GO”。
