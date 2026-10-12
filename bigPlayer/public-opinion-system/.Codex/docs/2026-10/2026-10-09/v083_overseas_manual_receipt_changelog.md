# 海外 manual 持久receipt与DB窗口证据候选

Status: partial-offline-frozen / developer-93-PASS / independent-QA-pending / RUNTIME_NO_GO

新增显式file receipt factory，私有WeakSet标识reader，任意read回调不具备能力。prepare实际pinned conn只读锁source/account/credential/全站registry/逐站board completed checkpoint原始集合，使用DB UTC anchor与Repository现行effectiveBigPlayerWindow。固定scope/window/游标hash进入requestId，确定性run IDs。SQL rollback释放锁后root.temp wx+fsync+hardlink发布不可变canonical文件；重启reader按requestId恢复，不把文件成功当DB提交。

该快照是pending marker当前采集准入证据，不是假造点击时历史配置。marker仍合并pending口径。目录与文件完整性校验沿现Journal模式；文件fsync不承诺跨文件/DB原子或目录断电持久性。跨重启首次run授权/epoch恢复和真实执行仍未闭合。待接handoff证据重验、只读reconcile、故障注入/复审/冻结QA；生产不执行SQL。

已接：handoff仅真实factory品牌reader通过，重验cursor全集hash及固定anchor推导window；当前DB时间只检不未来，不重算窗口。Repository新增reconcile方法，repeatable-read READ ONLY快照核对所有确定性run ID：全站精确=accepted（不清任何marker），全无+原marker=not_committed，部分/冲突/marker变更=unknown，零自动补写。测试改用真实文件receipt而非注入read，并以新Node进程验证读恢复；SQL执行器仍fixture。

验证：manual14tests+drain7tests21/21；员工只读复审无新增冻结阻断。候选11冻结12文件93/93、640份SHA前后一致，manifest v084、handoff v085；不编辑候选10。最初并发测试因文件read异步顺序不同暴露测试结果顺序假设，改为集合断言，一组accepted、一组already_accepted及插入次数不变。

未完成：receipt目录断电持久性/TOCTOU全部故障矩阵、真实MariaDB隔离、receipt到首次授权实际接线、epoch>1恢复、全入口独占、第二源和真实DB/HTTP/AI翻译定时槽。新进程receipt读取测试不代表新进程已执行runSource。未commit/push/发版。
