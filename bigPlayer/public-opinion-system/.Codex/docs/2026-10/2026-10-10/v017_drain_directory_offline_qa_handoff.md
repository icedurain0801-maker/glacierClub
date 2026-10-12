# 排空与目录策略离线增量QA交接

Status: OFFLINE_DRAIN_DIRECTORY_INDEPENDENT_PASS_SQL_DRAIN_NOT_VERIFIED_FULL_RUNTIME_HOLD

一句话需求：独立验实际runOnce+内存依赖的排空清理因果闭包，以及isolated目录策略对伪production授权/外部路径的拒绝。

已拍板：项目经理明确用户已弹窗拍板安全离线实施/冻结/QA。只当前模型、开发唯一写入；不SQL/13316、不DDL、不生产目录访问/ACL/服务、国内和其他平台不动；不HTTP/AI/受限proof或替代。不改正在QA的9io1Ti包，生产FULL_RUNTIME_NO_GO/CUTOVER_HOLD。

## 冻结与命令

仓库根 `.temp/overseas-qa-scheduled-stage-YLd7mL`，703files，manifest SHA `8cd2055454032909f71d9fefa7c00d4ef1d01f0d156a9ae59f532002c5eb9763`。只运行以下离线增量，绝不执行此包SQL命令：

1. `node scripts/freeze-overseas-scheduled-candidate.js --verify 8cd2055454032909f71d9fefa7c00d4ef1d01f0d156a9ae59f532002c5eb9763`
2. `node --require ./scripts/offline-test-guard.cjs --experimental-test-isolation=none --test worker/test/overseasSharedRuntimeDrainClosure.test.js worker/test/overseasStateDirectoryPolicy.test.js worker/test/overseasSharedRuntimeLifecycle.test.js`
3. 再verify，独立保存raw/SHA与报告。

新增 `worker/test/overseasSharedRuntimeDrainClosure.test.js`；目录test追加一项；freeze新增这两文件和drainDirectoryOffline命令/scope。未改业务：工作树及9io1Ti相同SHA：worker.js `ca3a0c8fd3c8f7c8fa40c01d918680cda81e3493f8d830f9c74d84dbde785d2b`，lifecycle `c91d9efa0ff4235db33b7e3c0bf9196f0dc2024af6de18d28a78a049dbe06ac7`，state policy `6dab92f2d7d0832df4f15b061dbfb30af0995b2f0ab6bafaafa793c65d54d34f`。

## 实测边界

开发最终13项离线PASS（新增排空3、目录4含新增1、现有lifecycle6）。新排空包含27个未知quiescence拒绝子例、2个quiescence/candidate异常子例；不是13个新测试。实际runOnce使用无query内存repo及显式scanLease，避免恢复分支；gate阻塞queue read，3ticket保持，异步lease.release未完成时close等待，再依次等待独立cleanup与candidate完成才pool.end。拒绝准入同步生效，重复ticket.release不减负计数。无计时长等，无30秒renewal实测或SQL lease证据。

目录负例拒伪production brand且validatorCalls=0；可信isolated策略拒外部生产路径在访问前，缺子目录按真实ENOENT。只在仓库根.temp创建隔离目录。不证明ProgramData owner/ACL/fsync/atomic rename/持久重启恢复。现役共享worker.js shutdown未接此lifecycle，真实SQL drain和生产入口未证明。

## 开发原件SHA（仓库根.temp）

| 原件 | SHA256 |
|---|---|
| YLd7mL-dev-preverify.raw.txt | 9877c58510083178cc805d00a13d944e8cf733dc98076b1e94a26b653f3e8679 |
| YLd7mL-dev-drain-directory.raw.txt | cc943ea05cf7e33214a5b28a87fdfb06931d0907155ae491cc53e16aed0dde62 |
| YLd7mL-dev-postverify.raw.txt | 9877c58510083178cc805d00a13d944e8cf733dc98076b1e94a26b653f3e8679 |

全部命令exit0，OFFLINE_GUARD_DENIALS:{}。请QA独立重跑而非引用开发PASS，仍优先保持当前9io1Ti真实04:00等槽实例，不重启、不换包、不占端口。本增量可按QA可用顺序纯离线处理。未commit/push/发版。

独立QA核收：已完整读取 `.tests/2026-10/2026-10-10/v013_drain_directory_offline_independent_qa.md`，三个QA原件SHA逐一重算全部匹配；pre/post均verified=true/703，离线13pass/0fail/guard无拒。QA pre/post SHA `9877c58510083178cc805d00a13d944e8cf733dc98076b1e94a26b653f3e8679`，offline SHA `30ea72f6185edd340f3e6192a27d1f2fdfb6a47bcb57825fbe24933730508d51`。root另对同冻结包只读verify703通过，未重跑测试/SQL。仅核收OFFLINE_DRAIN_DIRECTORY_PASS，SQL_DRAIN_NOT_VERIFIED和FULL_RUNTIME_NO_GO/CUTOVER_HOLD保持；9io1Ti session62657真实04:00等槽仍由QA原进程继续，不替代、不干预。
