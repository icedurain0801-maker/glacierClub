# 候选13恢复组合E2E局部QA交接

Status: frozen / developer-99-PASS / independent-QA-pending / RUNTIME_NO_GO

一句话需求：独立验收单site实际函数恢复组合链与恢复读取后他方抢先claim的离线拒绝路径。

已拍板决策：仅隔离当前模型、旧快照留存、现役/生产/真实HTTP/DDL/登录刷新/第二消费者不动、不push发版。

文件路径：仓库根 `.temp/overseas-qa-candidate13-20261009-01`；本项目v090 manifest、v089变更；worker/test/overseasBigPlayerMainChain.test.js。本批仅测试/文档变更，业务候选不变。

请对方做：校验641SHA前后，快照manifest12文件node --test（开发99/99）。审recovered模式实际receipt.prepare/Repository handoff SQL→新reader recover→实际readonly reconcile+第二读→原factory→actual runSource claim/renew→实际Journal/page+AI/翻译各1入队→单次终态。competing-claim在factory读完后设他方owner、actual claim SQL affected0，断言零HTTP/Journal/内容/续租/终态。

证据边界：单站；SQL/HTTP执行器fixture，claim WHERE/CAS按模式固定结果；receiptConn事务noop/marker CAS固定1，终态辅助和部分checkpoint stub；真正文件操作隔离root.temp。此为实际函数编排/SQL生成组合，不是实际MariaDB隔离或跨进程执行。已独立manual状态fixture仍覆盖txn故障，不混为组合fixture的事务证明。

仍未完成：新进程SQL执行、多站部分进度/epoch>1持久恢复、全入口独占、真实MariaDB与文件TOCTOU/断电完整矩阵、第二源及真实采集/AI译文/定时槽。保持PARTIAL_RECOVERED_CHAIN_PASS / RUNTIME_NO_GO，独立报告回开发负责人与经理。
