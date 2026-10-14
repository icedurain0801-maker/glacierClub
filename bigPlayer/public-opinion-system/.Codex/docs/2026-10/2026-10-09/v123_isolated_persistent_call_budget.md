# v123 隔离逐调用持久预算

Status: DEV_SQL_PASS_QA_PENDING

新增 `server/src/db/overseasIsolatedCallBudget.js`，仅在自有 13316 隔离数据库使用，逐连接核 PID/datadir/schema。四张 fixture 专属表保存 manifest 正文、UTC 日全局及精确身份窗口 scope 额度、逐 callId 记录和 disabled outbox。固定全局预算→scope→manifest→call→content→job 锁序。scope 不含 manifest SHA，换清单不重置额度；配置额度改变拒绝。COMMIT 异常销毁连接并返回 UNKNOWN，不返回消费凭据。

精确准入复用品牌 manifest，实际 SQL 再核 source/account/game/community、窗口、当前 fingerprint、jobId/contentId/profile/version。重复 callId 只只读式返回已记录状态，不可再次消费；消费前复核当前内容和任务。消费只有事务内模拟标记和禁发通知记录，没有任意 callback、真实 AI 或通知接口。预算不退款，不完成现役 job。

新增隔离脚本和 `--isolated-call-budget`。计划验证真实并发最后额度、重建 store 计数、消费重放、reserve 后 fingerprint 变化、额度配置改变。新 Node、ACK 丢失、translation 矩阵仍待验证，不宣称完成。

## 开发验证补充

审查修复 receipt getter/可变读取：只接受精确自有数据字段，捕获不可变快照，消费 UPDATE 必须命中一行。全局预算为 UTC 每日，scope 使用固定 1970-01-01 桶表示身份窗口总额度，不跨日重置。

最终开发原件：仓库根 `.temp/overseas-real-db-dMKhzp/result.json`。13 项真实 SQL 检查通过；独立 Node 持久读取、reserve/fake消费 COMMIT 后 ACK 丢失均已实测，UNKNOWN 无可消费结果，重放不再返回 receipt。第二 ACK reserve 夹具显式把此前已耗尽的全局日桶移至合成旧日，只用于创建新隔离场景，不是业务重置能力，也非真实跨日实测。translation、完整逐字段漂移及生产消费者仍未验证。instance serverStopped/portReleased 均 true。

此前 ML8eNK/Y7bB9v 原件保留，不冒充最终闭包证据。上述“待验证”段保留为实现时记录，以本补充为当前开发结果；独立 QA 待执行。

父任务可信 SQL 聚合另项仍未实现；受限恢复 proof 不修改。国内/现役/生产 DDL/HTTP/服务切换不涉及。

## 当前冻结开发证据（保留上述活动树历史）

冻结：仓库根 `.temp/overseas-qa-scheduled-stage-ghwuaG`；清单外部 SHA256 `bb86eb5e404806f4ca5e9fc5a17fefba4ae7adbaae1c8a7c04d8e900108c1326`，688 文件。

在冻结目录按序执行：

1. `node scripts/freeze-overseas-scheduled-candidate.js --verify bb86eb5e404806f4ca5e9fc5a17fefba4ae7adbaae1c8a7c04d8e900108c1326`
2. `node scripts/overseas-isolated-mariadb.js --isolated-call-budget`
3. 同第 1 条后验。

当前冻结 SQL 原件：仓库根 `.temp/overseas-real-db-mC6qGc/result.json`，SHA256 `23f7c45e6119d60faf64486646e2fe111ba31c0b83d130304b5d6872fca94c1c`，13 检查 PASS，serverStopped/portReleased 均 true。

前后 verify 原始输出位于本会话 `functions.exec` 工具结果 chunk `a7c8cd`（exit_code 0），两次输出均为 `{"verified":true,"files":688}`；未单独落盘，因此没有可提供的 verify raw 文件路径/SHA。该限制已在 v124 记录，不能补造文件冒充当时原始记录。QA 已接独立前后 verify 和 SQL raw 落盘要求，开发证据不替代独立证据。

父任务、translation 和逐字段漂移维持独立未完成项；本候选仅真实持久 fixture 预算与 fake 消费，不代表真实 AI 链完成。
