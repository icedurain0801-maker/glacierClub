# 单消费者分源接线候选

Status: opt-in-offline-candidate / production-NO_GO

- 新增分源resolver，可信身份准入后海外独享connector/pageStore依赖；非目标返回原deps，不全局替换repo。缺adapter/合同失败不回旧链。
- runSource可选路由先于任何claim或legacy副作用；syncStagePage绑定run合同和实际请求cursor，原主链继续fetch/normalize/commit。
- 新增drain admission原语与runSource收口票据，保留在途操作；尚未覆盖scan/scheduler/manual poll/main shutdown全部入口，不能称完整安全drain。
- 默认buildDeps不启用新路由。真实run创建/恢复/历史证明与消费者接管尚未完成，不能运行生产；新路由必须提供同事务PageJobs，避免重复翻译入队。
