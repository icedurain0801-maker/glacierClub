# 成功runSource离线生命周期验证

Status: isolated-candidate / developer-9-PASS / runtime-NO_GO

MainChain新增实际runSource成功路径：实际factory/loader，Repository原claimSyncRun/_claimSyncRunOnce SQL随机生成persisted owner并递增epoch/attempts，原renew SQL，首次scope许可创建真实测试Journal，站点授权→发现feed→帖子页及空评论页事务→AI/翻译各一次INSERT→单次completed_authorized_scope终态。每次HTTP夹具调用前验证精确Journal。

最小9/9 PASS exit0；成功测试不直接mock claim方法，但SQL执行器仍fixture，不是MariaDB验证。AI/翻译仅入队，未消费完成；评论为空，不能据此证明补漏覆盖。fixture checkpoint改Map按ID独立，不放宽业务scope检查。

首次owner注册测试继续补严格完整scope、不可重领和失败一次消费。epoch恢复交接/观察持久恢复/drain/单消费者/第二源和真实回归未完成，普通buildDeps仍不启用，不触生产。候选7原样保留，后续新快照交QA。
