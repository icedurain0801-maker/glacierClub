# Luna 二次复核与评论语境分析

Status: 本地实现及自测完成，未发布。用户已确认设计；不批量重判历史、不提交、不推送、不上线。

## 行为

- TypeSafe 保留初判。非空评论，以及初判 L1/L2/L3 的帖子，使用固定 `gpt-5.6-luna` 独立复核。社区 light 强度不能跳过关注级复核；off/范围设置仍在复核后过滤最终结果。模型不接收初判等级、原因或引文。
- 同一次复核输出最终等级、情感与概率、中文等级原因、中文情感原因、当前文字连续引文。评论结合原帖及被回复评论理解附和、反驳、已解决、情感指向；保留中性。上下文只解释当前评论，不直接继承风险等级。
- 原帖和被回复评论由已存祖先关系读取，限定同游戏、来源、账号、社区、版块，排除已删除内容。原帖缺失时明确标记，不能使用评论携带的旧标题替代。上下文按有效正文清理并限制每段4000字符。
- 缓存绑定新 provider `typesafe-v14-luna-context-review-v1`、固定复核模型、当前正文和上下文哈希。后台积压消费者、每日/手动消费者和非队列兼容入口都传递上下文。入库事务重新读取并锁定相关上下文，变化时拒绝保存旧结论。
- 新版关注级也必须具备有效独立复核记录。严重告警保留原先的具体问题、置信度、严重事件和当前原文引文硬校验。旧 provider 验证方式保持兼容，历史记录不修改。
- 复核失败不缓存、不入库、不发通知，沿用任务重试。30秒单次预算；正常情况下同一次调用完成等级、情感与原因，避免再串行生成一份重复原因。
- 详情页展示情感原因、原帖是否可用及模型名称。原有详情API中的 urgent_review JSON 已包含新增字段，不增加数据库迁移；BaaS 读模型沿用已有 JSON 透传。

## 修改文件

- `server/src/services/commentAnalysisContext.js`：新增共享上下文、哈希、范围约束。
- `server/src/integrations/typeSafeUrgentReview.js`：固定模型、独立复核输出契约、中文原因和情感校验。
- `server/src/integrations/typeSafeAnalyzer.js`：L1/L2/L3与评论复核编排、缓存版本、最终原因与情感。
- `server/src/services/urgentValidation.js`、`riskSeverityNormalizer.js`：新provider兼容及保存前硬校验。
- `server/src/services/aiAnalysisPolicy.js`、`aiAnalysisDebug.js`：默认规则、隔离调试原帖及复核字段。
- `server/src/db/repository.js`：队列上下文、兼容读取、事务内上下文核验。
- `worker/src/worker.js`、`worker/src/q1DailyAnalysisRunner.js`：两个现役消费者及兼容入口传递上下文。
- `../admin/PublicOpinion/assets/content.js`：复核详情展示。
- 新增 `server/test/contextualSecondaryReview.test.js`、`server/test/fixtures/contextualReview.js`、`worker/test/contextualAnalysisQueue.test.js`；适配相关旧测试夹具。
- 校正每日分析旧用例的一处过期预期：普通可核查异常等级为 L2/negative，不应期待 L3/urgent；改前隔离恢复本轮两处worker变动后也存在同样断言失败，证据位于仓库根 `.temp/context-review-q1-baseline.txt`。没有为通过测试修改普通异常的业务判级。

仓库存在既有未提交改动，以上文件只作定向增量修改，没有将整个diff视作本轮新增。

## 验证

1. 相关后端/队列79项通过，前端42项通过，仓储claim定向5项通过，共126项。新增用例覆盖三态情感、L0评论复核、L1强制复核、L2/L3原文证据、缺失上下文、跨归属SQL约束、缓存失效、入库拒绝旧语境、模型异常重试及无通知副作用。
2. 真实模型接口：3条人工构造内容，固定请求gpt-5.6-luna，TLS证书校验开启，全部通过。原帖不满下韩语附和表现为轻微负面态度；纠正现状并肯定功能为正面；无原帖的“是的”为中性。仅验证模型接口，不读写业务数据库，不将模型的一次输出当成所有同类句子的确定结论。
3. 隔离HTTP接口：草稿调试POST/轮询GET及手动重判POST通过；真实分析编排搭配模拟模型响应和隔离仓储，无真实入库。可见Edge验证4条评论详情：中文原因、三态情感、上下文状态、模型、桌面及390px视口；既有L2/L3合并入口浏览器回归通过。
4. 语法和限定路径空白检查通过。测试输出、真实模型结果、浏览器JSON与截图位于 `.tests/2026-10/2026-10-15/contextual-review-*`。

## 边界

没有重启服务、切换ProgramData运行包、上传BaaS静态版本、修改生产配置、真实审核或通知。正式页面仍运行已部署版本，新的分析规则需要另行确认发布后生效。历史数据仅在用户指定手动重判时才按新规则更新。

复核会增加外部AI调用量和分析耗时；真实样例约2至3秒。上游失败会重试，不能承诺所有分析瞬时完成。原帖未采集、被删除、归属不符或正文清理后为空时使用明确的缺失状态。评论情感与风险等级是独立维度，负面态度不自动等于具体异常或紧急事件。
