# 候选8首次owner注册与成功runSource冻结交接

Status: PARTIAL_OFFLINE_40_PASS / independent-QA-pending / runtime-NO_GO

快照：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-candidate8-20261009-01`。
Manifest v074_overseas_candidate8_success_frozen_manifest.json：632项源码/安装依赖/lock/授权7tests，Node v22.22.0；开发精确testCommand40/40 PASS exit0，后hash一致，仅额外snapshot-raw.txt。旧脚本/env/服务资产/日志及junction排除；不任意全目录运行、不当部署包。

实际实现：owner-free完整首次scope许可在claim后绑定当前DB随机owner/epoch，只允许attempts1/epoch1/live；验证前一次消费，初始化拒同runId多许可，精确合同也强制epoch1。默认恢复缺证不创建，重领epoch无证失败关闭。

实际离线正链：runSource→factory可信identity→原Repository claimSyncRun/_claimSyncRunOnce SQL生成随机owner/epoch→原renew SQL→首次注册真实测试Journal→授权/发现feed→post与空comment页PageStore事务→AI/翻译各一次INSERT→单次completed_authorized_scope终态。SQL执行器/HTTP仍fixture；terminal辅助方法为fixture，非MariaDB/真实采集/AI译文完成。checkpoint夹具按ID Map，避免覆盖。

本地员工只读审查后补同runId/epoch限制，已复跑。请QA仅核新632hash/Node/无链接、执行v074.testCommand再核后hash，Journal证据保留在仓库根.temp。

未完成：重领epoch持久恢复/观察intent-commit-reconcile/可信provider loader/历史scope复用/完整drain全入口/单消费者受控切换/第二源board-registry-401/真实规模与DB-HTTP-AI翻译验收/下一定时槽/共享基线。普通buildDeps未启用，现役PID19584/DB/任务/真实HTTP/第二消费者不变，不占3001、不删除旧方案、不push/发版。
