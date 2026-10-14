# 候选scan/poll/manual收口接线

Status: isolated-candidate / developer-verified / independent-QA-pending / runtime-NO_GO

可选drainController增加受信存活ticket身份；runOnce扫描与任务分别admit并finally释放，runSource可继承同controller的任务ticket，drain后不再新增任务而已admit工作安全结束。扫描health/recovery/queue/manual/scheduler及异步返回后检查drain；poll查询返回后再检查，backlog不启动新入队。

仅有controller的候选manual不再扫描时先清marker：任务admit后以读取时间戳CAS清除，ticket跨CAS和runSource，marker变化拒绝。queued来源marker不清，未admitmarker保留。普通无controller行为不改。

候选生命周期已等待 scan/task/poll/异步 scan renewal 清理后关闭session/pool；不接入现役main。scan/poll/manual竞态6/6，候选9扩展冻结回归78/78（11文件），637份SHA一致，独立QA待执行。scheduler schema await竞态另见v077。

未闭合：现役main shutdown实际接入、marker进程崩溃durable交接、全入口单消费者生产切换、观察与epoch持久恢复/第二源及真实验收。已启动recovery/scheduler允许完成，禁止把drain理解为即时abort。不改现役或默认buildDeps；新代码另冻结。
