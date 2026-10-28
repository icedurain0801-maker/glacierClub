# 讨论主题语义提取与增量缓存

Status: deployed, 2026-10-20

用户要求优化固定词表遗漏、多语种同义表达和评论上下文。新增 server/src/services/feedbackTopics.js，复用已有AI配置及每日调用额度，后台批量提取每条内容最多3个中文具体主题。模型不计数，程序按内容ID去重、按日期和情感汇总，至少2条展示。固定词表补充伤害/输出/PvE/PvP/energy等术语。

缓存位于 E:/CodexData/public-opinion/data/feedback-topics/cache.json；键包含版本、模型、社区、原文和原帖上下文，跨日期复用，新内容和修改内容才调用。原帖可以来自筛选范围之外，但不计入筛选范围反馈数；上下文仅限同社区。模型返回ID、条数、主题类型和长度校验，空主题正常缓存，失败不写完成缓存并退避5分钟，单次失败停止剩余批次避免额度耗尽。概览不等待模型，未完成时明确显示规则结果/进度，不混合部分AI计数与规则计数。

程序额外过滤“问候、情感表达、点赞讨论、角色称呼”等泛化标签，防止模型忽视噪声过滤要求。对完全同义的伤害削弱/掉线表达补充确定性归并。语义模型仍可能错分或生成不同标签，不能保证全部同义表达合并；文本输入最长6000字符、原帖上下文2500字符，超长内容尾部不参与AI提取。

修改 server/src/services/frequentFeedback.js、baasReadRepository.js、db/repository.js、app.js，以及前端 assets/app.js、index.html、public-opinion.css。无数据库迁移，无钉钉发送，不修改采集/业务风险规则。

验收：隔离统计、翻译、语义提取测试和浏览器切换测试通过，覆盖同义去重、情感、上下文、缓存恢复、仅新增重分析、错误响应、噪声兜底。真实Hero Clash今日236条完成提取并持久缓存；模型此前漏返回无意义内容，补充完整输出模板后条数校验通过。重复标签主要为泛化表达，程序过滤后没有可展示的具体高频主题，未凑数量。真实批量调用消耗现有AI每日额度，本次已授权优化。

现役 release-20261020-resilience-r1 与 frontend release-20261020-weekly-two-lines-r1按片段更新，API重启后Running；备份在仓库根 .temp/frequent-feedback-20261020/pre-semantic-backup。前端资源版本20261020-feedback-semantic-r1。已有BaaS查询Token失效401阻断登录业务API端到端验收，未绕过鉴权；服务模块真实提取与线上静态资源分别验证。
