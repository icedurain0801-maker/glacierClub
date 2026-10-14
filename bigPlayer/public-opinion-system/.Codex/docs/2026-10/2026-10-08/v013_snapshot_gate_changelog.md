# 同快照门禁隔离实现变更记录

Status: isolated-qa-pass-production-no-go

## 范围与边界

本次仅实现隔离候选，不连接生产、不执行生产锁库/备份/恢复/迁移，不提交或推送未验收候选。此前备份仍缺同快照源端参照，生产门禁继续 `NO_GO`。

## 已完成项

- `server/src/db/snapshotGate.js`：新增依赖注入式 fail-closed 编排，持锁期间执行独立对象全集与源端前清单、独立 dump、对象全集与源端后清单；解锁后用同一 `artifactId` 及前后 SHA/字节校验恢复并逐项比较。必须传入静态完整对象基线，看门检查锁主连接 ID、时限与磁盘阈值；硬超时销毁锁主，清理和子进程退出未确认可推翻成功状态。
- `server/test/snapshotGate.test.js`：35 项纯隔离回归已通过，覆盖正常路径、空/漏对象、锁获取/连接失效、超时、空间、artifact 篡改、dump/恢复失败、前后及恢复差异、清理失败。测试使用 fake 连接，尚非真实数据库或百万行负载证明。
- `server/src/db/snapshotManifest.js`：改为同一 `mysql2/promise` 连接上的原始流读取，固定 UTC 与 `utf8mb4`，字段按类型、长度及原始字节编码，按行数和字节双阈值增量分块哈希；纳入表、视图、触发器、例程、事件和库默认字符集/排序规则的定义摘要，数据库异常只输出固定错误码。
- `server/src/db/snapshotManifest.js` 审查修正：保留表定义里的 `AUTO_INCREMENT` 高水位；显式 `SET NAMES utf8mb4` 并校验 client/connection/results 三项字符集；在扫描前拒绝 `@@max_allowed_packet` 超过 64 MiB 或无效的连接。包大小门禁限制允许接收的逻辑报文，不等于 Node 峰值 RSS 上限。
- `server/test/snapshotManifest.test.js`：13 项合成单测通过，含 `BIT`、复合主键、空表自增高水位差异、字符集与单包限制、字节预算；未代表真实 MariaDB 或生产数据验证。
- `.tests/2026-10/2026-10-08/snapshot_manifest_isolated_e2e.js`：人工数据的独立 MariaDB 10.4.14 演练初次通过，43314/server_id=20261015、全新 datadir、3 表 9 对象；锁下源端前后清单、独立 dump、无 `--force` 恢复端逐项匹配，单行和索引改动均能检出。脚本启动/清理安全性复审中，仍不得把此项写成生产 `RESTORE_VERIFIED`。
- `.tests/2026-10/2026-10-08/snapshot_manifest_load.js`：纯人工 100 万行流两轮，通过固定种子与复合主键验证 100 块及 9999/10000/10001 边界，峰值 RSS 约 53.3 MiB、采样堆约 9.6 MiB，低于脚本设定的 512/256 MiB 预算。约 26.2 万行/秒仅代表内存假流，不能外推真实数据库扫描或生产锁时长。
- `.tests/2026-10/2026-10-08/snapshot_manifest_isolated_e2e.js` 最新重跑：全新隔离实例中 100 万人工行加 1 MiB BLOB，5 表 11 对象；源端前后和恢复端清单相等，单行/索引变异均检出。持锁 5,645 ms，源端两次扫描分别 2,666/2,609 ms，恢复扫描 2,696 ms，dump 31,998,022 字节；峰值 RSS 99,909,632 字节、heap 27,175,704 字节，均低于人工夹具预算。结果位于仓库根 `.temp/po-closeout-20261008/snapshot-manifest-isolated-BjiLf6/result.json`，脚本/manifest/gate SHA256 已写入白名单结果，43314 后验无监听。以上为本机人工数据，不外推生产锁窗口。
- `.tests/2026-10/2026-10-08/snapshot_gate_fault_isolated.js`：同版隔离 MariaDB 实例与真实 owner/watcher 连接的七个故障场景均返回 `NO_GO`，无 `RESTORE_VERIFIED`：显式表写锁阻锁、事务内活跃写语句阻锁、持锁连接断开、dump 非零、空间阈值、恢复摘要差异、中断清理。先试事务内 `SELECT SLEEP(6)`，虽确认查询活跃，FTWRL 仍成功，故该读语句不是有效阻锁夹具，反例证据保留在 `snapshot-gate-fault-long_transaction_contention-wzfwDQ/result.json`。改为事务内 `UPDATE ... SLEEP(6)` 后，查询在门禁返回时仍活跃，FTWRL 报 errno 1205，门禁返回 `LOCK_ACQUIRE_FAILED`，并在结束后回滚。最新七例脚本 SHA256 `b952f9f23ad1af937d0f1b19b33e247d600e9c44c089f97603c3a42943125f41`，长事务证据位于 `snapshot-gate-fault-long_transaction_contention-dBJsDC/result.json`；各例后验 43316 无监听、自有实例和辅助进程均退出。`VERIFIED_ISOLATED` 只适用于该本机 MariaDB 10.4 活跃写语句，不代表空闲事务、其他数据库版本或生产锁窗口。
- `.tests/2026-10/2026-10-08/snapshot_manifest_isolated_e2e.js`：修复 AUTO_INCREMENT/字符集后的候选再次以 100 万人工行加 1 MiB BLOB 演练，5 表 11 对象；源端前后和恢复端清单一致，数据/索引变异均检出。持锁 6,175 ms，dump 31,998,022 字节，峰值 RSS 98,938,880 字节、heap 28,073,560 字节。最新证据 `snapshot-manifest-isolated-5pDwei/result.json` 绑定脚本 SHA256 `017ca46bfe564008c521ac22ff18d80d06f75247276ae7a35daea1d60b87f427`、manifest SHA256 `70491082864b835722abc2b8a1c56899687db57466262ca1a31c0890360a7be4`、gate SHA256 `6af1cebf7c665d068a58df2d86463d9a92b36ffe1585d7916b421816d1674f46`；43314 自有实例已退出。本机人工负载不能外推生产数据分布、IO 或锁时长。

## 待完成项

- 独立代码审查指出的固定对象全集、dump/restore 文件身份绑定和强制超时清理已在候选代码与纯隔离单测补齐；真实生产门禁接线尚未完成。
- 真实隔离 MariaDB 的完整前后清单和 dump/restore 已用小夹具与百万行人工夹具重跑并绑定候选哈希；七个本地故障注入也已绑定哈希，其中仅活跃写语句的长事务阻锁在隔离环境复现。实际生产数据分布/IO、生产锁窗口、正式执行器接线和空闲事务边界仍未验收，不能据此批准生产锁库/备份/恢复。
- 测试负责人独立 QA 结论为 `PASS_ISOLATED_SNAPSHOT_GATE_FAULTS_AND_LOAD`，报告位于仓库上级 `.temp/po-closeout-20261008/v011_snapshot_gate_isolated_independent_qa.md`。独立重跑七例全部失败关闭；百万行人工演练通过，锁持有 6,081 ms；43314/43316 后验均无监听。生产全库对象与真实表类型覆盖、生产数据分布/IO/并发写入/空闲长事务、正式执行器接线及批准窗口仍未验证，不得将隔离结果写作生产 `RESTORE_VERIFIED` 或生产可执行批准。
