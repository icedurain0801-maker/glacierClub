# 持久目录与排空隔离测试准备

Status: OFFLINE_DRAIN_DIRECTORY_INDEPENDENT_PASS_SQL_DRAIN_NOT_VERIFIED_PRODUCTION_HOLD

项目经理02:30派单及03:00后续派单授权不依赖受限proof的隔离排空/持久目录方案与离线测试实施。员工只读提交测试patch，root核代码后唯一apply_patch写入；最终冻结13项开发离线PASS，独立QA待验。不涉及生产目录、ACL、服务、第二consumer、SQL、真实HTTP/AI，不修改共享worker.js或国内现役。

## 现状与可验证范围

`worker/src/overseasSharedRuntimeLifecycle.js`是真实独立生命周期模块，close依次pause→等待scan→等待drain tickets→verifyQuiescent→candidate cleanup→pool.end。静默证据的scanIdle/pollIdle/renewalsIdle/commitLanesIdle/leaseReleased必须全部严格true。依赖仍是注入callback；共享现役worker.js关闭入口直接pool.end，未接该完整生命周期，不能用模块测试证明生产shutdown或SQL事务排空。

`worker/src/overseasStateDirectoryPolicy.js`仅提供可信WeakSet branded isolated-v1，允许仓库根.temp已有无链接目录，production策略刻意未实现。ProgramData只是生产候选规划，未部署/创建/访问/核ACL。

## 最小离线方案

1. 新增候选 `worker/test/overseasSharedRuntimeDrainClosure.test.js`：调用实际runOnce及lifecycle，但repo/scanLease为内存fixture，repo不提供query避免触发恢复。gate阻塞queue read，外层lifecycle ticket、runOnce ticket、独立cleanup ticket共3个。close同步停止准入；释放queue后先scanLease release与两个扫描ticket，再独立cleanup释放，最后quiescence、candidate cleanup和pool.end。candidate另有gate证明pool等待完成。没有计时睡眠或实际SQL长事务。
2. quiescence矩阵null/undefined、五字段逐一缺失/undefined/'true'/1/false，全部BLOCKED且无candidate/pool关闭；quiescence或candidate异常不得穿透pool.end。
3. 现有state policy测试补伪造production policy不得调用validator，可信isolated policy不能解析外部生产路径；不存在journal仍按真实ENOENT，不改业务错误码。仅正式测试创建仓库根.temp子目录，绝不创建生产路径。

验收必须标离线内存runtime因果闭包；不称真实SQL drain、生产目录owner/ACL/fsync/atomic rename/重启恢复或现役入口已接线。后续作为独立增量冻结QA，当前不改变正在真实等槽的9io1Ti包。

未commit/push/发版；完整runtime/生产切换持续FULL_RUNTIME_NO_GO/CUTOVER_HOLD。

即时变更记录：新增DrainClosure测试，目录测试追加伪production授权、生产路径逃逸与缺目录负例；freeze增加两测试文件及独立离线命令/scope。只改工作树上述三个文件，不改QA正在使用的9io1Ti。测试调用真实runOnce/lifecycle但依赖内存对象，三ticket观测，异常矩阵27例及cleanup异常2例；无SQL/HTTP执行。

首次三文件语法及13项离线测试PASS/exit0。员工复审核finally异步因果后追加内存lease.release gate：解除queue读取后仍保留三ticket，等release完成才进入scan-returned；再等独立cleanup和candidate完成才pool.end。显式断言repo无query、mode off。不称真实30秒renewal或SQL lease释放。修正后另验证并冻结，首次PASS不替代最终包结果。

最终冻结YLd7mL/703files，manifest `8cd2055454032909f71d9fefa7c00d4ef1d01f0d156a9ae59f532002c5eb9763`。冻结前后verify以及13项离线测试exit0，原始结果已保存仓库根.temp，guard denial为空。工作树worker.js/lifecycle/state policy三个业务文件SHA与9io1Ti逐一一致，未改业务或原QA包。独立交接见v017。未占13316，无SQL实例owner。

独立核收完成：QA报告v013已完整读，三原件SHA逐一匹配，13/13离线PASS且703前后verify；root额外只读verify703通过。仅离线模块闭包通过，真实SQL drain/生产目录/现役shutdown/持久重启仍未验；不干预QA原9io1Ti等槽，详见v017核收记录。
