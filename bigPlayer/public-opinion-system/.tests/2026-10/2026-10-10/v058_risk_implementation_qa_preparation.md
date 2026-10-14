# v058 风险组合候选独立 QA 准备

日期：2026-10-10。准备阶段状态：IDENTITY_VERIFIED_FUNCTION_PENDING。生产 HOLD。后续独立受影响范围已执行，结果见同目录 `v058_risk_implementation_independent_qa.md`；下表保留执行前计划，不作为当前待办。

## 只读身份核对

候选为仓库根 `.temp/risk-normalization-20261010/candidate-implementation-v066-r3/`，manifest SHA256：`18b8d560d48e85e4b05dcef24640da966d6566294ed267f758f0ce84d1a97234`，与项目 v066 索引一致。独立逐文件读取 api/analysis/collection 三树，共 1218 文件，SHA 全匹配、0 差异；changes 为 17 文件。该结果仅为身份检查，不构成功能 PASS。

只读查看了冻结 safeAnalysisEnqueue、historicalAnalysisAdmission、riskPolicyHistory 和员工 fresh SQL runner 的初始化/隔离方式。未执行员工脚本、未启动 DB/worker/API、未测试风险规则或来源。

## 待执行的最小范围

| 场景 | 独立证据要求 | 当前状态 |
|---|---|---|
| 消费者正文/任务双指纹及 owner/lease/attempt/profile/version 栅栏 | 冻结实际 Repository，fresh SQL，过期/变化时无结果与副作用写入 | 待 producer 员工证据补齐后执行 |
| 提交事务与并发 | 结果/缓存/quality/审计/positive-only关闭/deep/finish 同连接原子性，故障回滚及真实双连接锁交错 | 同上 |
| worker 缺方法 | 冻结实际入口缺事务方法时报错，无旧 writer 回退；与 enqueueOnly 路径区分 | 同上 |
| safe producer | 实际 SQL 保留 running/活跃 lease，force 冲突，精确 ID/profile/version/fingerprint 与历史 marker 不被普通 producer 擦除 | 同上 |
| producer API | 隔离本地实际 API 路由验证冲突响应及 writer 约束，不能以 helper/mock 代替 API PASS | 同上 |
| 历史静默 | 三 runtime AlertEngine 两入口无外发；可信 marker 的历史 admission/deep 继承与事务回滚 | 同上 |
| 活跃旧任务保留后当前正文精确补队 | 当前未实现；仅记录与实测现状，不承诺自动补队 PASS | NO-GO 保留 |

不重跑 v060 归一化矩阵或来源 v063/v064/v065。员工消费者 SQL16 项、worker/producer mock 与 AlertEngine12调用均为背景，不能累计为独立 QA PASS。待补交的新 producer 员工证据用于核范围和构造独立反例，不直接复用其结论。

## fresh SQL 准备与执行边界

本机 `C:/xampp/mysql/bin/mysql_install_db.exe`、`mysqld.exe` 已只读确认存在。拟用 127.0.0.1:13319（检查时无监听，启动前再检查）、独立 serverId、仓库根 `.temp/qa-v058-risk-*/data` 新 datadir。当前未创建 datadir 或数据库。

初始化与启动须显式隔离，运行配置使用 --no-defaults、独立 datadir/pid-file、event-scheduler=OFF、禁止外部网络。只注入 fixture DB 配置，不读取生产 .env、不启动正式调度器，不使用真实 AI/认证/通知。使用 schema fixture 和模拟数据验证真实 SQL；若启动隔离 API，配置、端口、网络出口同样限定本地 fixture。

实例身份须核 port/server_id/datadir/pid_file/进程 PID，清理仅停止自己创建且身份匹配的实例，确认端口释放，保留原件。此准备文档未执行任何 DB 或外部写操作。

## 未关闭的生产阻断

现役 API/shared 未切换；Q1旧 writer 未覆盖；translation ACL拒读；实时外发事务窗口；活跃旧任务后当前正文精确补队；生产国内/海外实际恢复验收均未关闭。候选功能验收不得用于关闭上述阻断。来源 v065 独立隔离 PASS 保持冻结。
