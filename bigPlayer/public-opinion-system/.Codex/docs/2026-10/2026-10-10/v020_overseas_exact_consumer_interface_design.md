# v020 海外专属精确 AI/翻译消费者接口（设计稿）

Status: DESIGN_ONLY_ISOLATED_CONSUMER_NO_GO_MANAGER_REVIEW_REQUIRED
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

本稿只定义一个未来可隔离验收的消费者契约，不实现代码、不执行 provider、不写生产表、不改现役国内消费者、不发通知。它响应 v018 对“冻结 jobId/contentId/fingerprint/profile 或 language/version 清单”的要求。旧 `overseasControlledManifest` 仍是 synthetic-only fixture，不得改名冒充生产授权。

## 1. 授权与冻结清单

消费者只接受经 authority gate 签发且不可变的 `manifest`。manifest identity 必须包含：

`sourceId、accountId、gameId、communityId、platform、windowStart、windowEnd、siteId、boardId、siteUrlHash、contractVersion、accountAuthVersion、manifestSha256、scopeSha256`。

每条 tuple 必须完整包含：

- 分析：`jobId、contentId、contentFingerprint、profile=light、analysisVersion`；
- 翻译：`jobId、contentId、contentFingerprint、targetLanguage、translationVersion`。

`jobId` 和 `contentId` 必须一一对应，fingerprint/version/profile 或 language 必须与 dispatch 前重新读取的数据库行、lease 和冻结 scope 完全相等。token、cookie、正文和 provider 原始 payload 不进 manifest 或其公开 hash；如需绑定授权，只保留不可逆敏感签名和版本号。

生产 authority、schema/readiness、预算算法、迁移和目录恢复当前尚未实现，因此新 manifest 默认 `productionActivationAllowed=false`。缺 site/board/contract 的 tuple 直接拒绝签发，不把配置未知折算成 `UNKNOWN`。

## 2. Consumer API（候选接口，不是现有函数）

建议新增隔离入口 `runOverseasExactConsumer({ manifest, mode, repo, provider, leaseOwner, clock })`，其中 `mode` 只能是 `analysis` 或 `translation`。入口行为固定为：

1. 验证 manifest 签名、版本、scope、tuple 数量和重复项；拒绝动态追加。
2. 以 manifest 中的 jobId 集合 claim 已存在的 pending job，并校验 source/account/game/community/site/board/window、fingerprint、version 与 lease。禁止用裸 contentId 推导任务。
3. provider dispatch 前原子 reserve 全局现役 cap 与海外本批 scope cap；两者任一不足即停止批次，不能借用另一账本余额。
4. 每个 tuple 单独发 provider 请求，建议 `maxRetries=0`。如经理以后批准重试，必须把每次 attempt 作为独立 callId 和费用记录，不能在 SDK 内隐藏重试。
5. 仅在收到可验证的 provider result receipt 后，在同一事务中写结果、attempt receipt 和 job completed；不调用 broad backlog、backfill、quality、deep 或通知路径。

禁止把现有 `worker/src/translationWorker.js:runControlled` 直接作为生产实现：传 `contentIds` 会先调用 `enqueueMissingTranslations`，仍可补任务；job-only 虽不 backfill，也缺完整 manifest/fullscope 校验。新消费者必须只 claim manifest 已列出的 jobId，不能扫描 pending、补入译文任务或按 contentId 自动建 job。

## 3. 分析路径的精确边界

分析只允许冻结的 `profile=light`。不得调用 `processPersistentAnalysisJobs` 或 `processDownstream`，因为现有路径会：

- 进行 light→deep escalation 和再次 enqueue；
- 写 cache/quality/reconcile alert；
- 进入 `AlertEngine`，其 `pushDingTalk` 可产生真实通知；
- 使用 broad source/window 查询而非逐 tuple manifest。

新接口应直接消费单个已 claim job，结果只写该 job 的 analysis/result 及审计；deep、告警、通知、规则扫描和本地 alert 均默认关闭。若以后需要 deep 或本地告警，必须另发 manifest、另设 scope cap、另做隔离 QA，运行时不可扩名单。

## 4. 翻译路径的精确边界

翻译只消费 manifest 已列出的 `jobId → contentId` 映射，且 targetLanguage/version/fingerprint 必须逐字段匹配。不得调用 `enqueueMissingTranslations`，不得依赖 `translationWorker.runOnce` 的 contentIds 模式，不得扫描所有 pending；现有 `completeTranslationJob` 的 lease/fingerprint/version 校验只能作为最终事务的一部分，不能替代 manifest 校验。

结果事务至少包括：译文、targetLanguage、translationVersion、contentFingerprint、manifestSha、attempt receipt、job status。旧 translation worker 若仍可取得同一 lease，必须先经过同一排他 gate；不能靠新 advisory key 旁路运行。

## 5. 计费与 attempt 状态机

每个 provider attempt 都有独立 `callId`，并绑定：`manifestSha、scopeSha、jobId、contentId、fingerprint、profile/targetLanguage、version、provider、model、requestHash、tokenCap、UTC billingDay`。单 tuple 单请求，避免 `AiAnalyzer.analyzeBatch` 将多 tuple 合并后无法精确归责；若未来批准 batch，必须记录完整 tuple 集合、部分响应和不可重放边界。

推荐状态：

`reserved → dispatch_started → result_received → atomic_complete`。

- reserve 同时核对现役 global cap、海外 scope cap、provider/model/token cap；不能另建旁路预算绕过现役总上限。
- provider 返回明确错误且未发送成功时，按批准策略结束为 failed/retryable；任何 retry 都重新 reserve 并计费。
- 请求已发送但 ACK/结果超时、连接断开或 receipt 不可验证时进入 `UNKNOWN_HOLD`。UNKNOWN 不重放、不退款、不自动转 retryable，必须人工/独立证据裁决。
- 未发送但 reserve 已成功的额度不自动退款；退款/释放需另一个经过审计的账务方案。

当前 `repository.reserveTranslationCall` 只有 UTC 日全局计数；`AiTranslator.callOnce` 默认最多 3 次重试且每次有自己的 guard，而 `AiAnalyzer.callOnce` 的现有 guard 只在进入循环前计一次，后续重试不会形成逐 attempt 账本。两者都不能直接满足本契约；分析实现必须改为单 tuple、每 attempt 原子 reserve，或提供等价的完整 batch 映射后才能实现。生产金额、每日 cap、本批 cap、模型/version、token 上限和失败费用规则均待经理收口。

## 6. 现役排他依赖与通知隔离

- 分析必须与现役 `po-analysis-consumer` advisory gate 形成同一排他 ownership；不能新建第二消费者或另建锁绕过国内任务。
- 翻译必须与旧 translation worker 的 claim/lease 形成同一排他 gate；不能让旧 worker 抢走 manifest job。
- 新接口不实例化 `AlertEngine`，不注入 DingTalk/webhook/notifier；不得通过环境变量全局关闭通知来影响国内。
- 现役 global budget、生产 authority、schema/readiness、目录恢复和单 Worker 加载方案尚未完成。新隔离接口的存在不改变 production NO_GO，也不能在现役共享进程未批准切换时启动。

## 7. 验收与明确未实现项

隔离 QA 至少覆盖：manifest 重复/缺字段/tuple 漂移拒绝；job/content/fingerprint/version/lease 不匹配拒绝；禁止 backfill/deep/alert/notify；每 attempt 一次 reserve/charge；provider error、retry、UNKNOWN_HOLD 各自终态；结果与 attempt receipt 原子提交；旧消费者无法同时 claim；国内任务与预算不受影响。

本稿明确未实现：生产 DDL/迁移、预算聚合算法和金额配置、authority/readiness、同一排他 gate 接线、真实 provider/HTTP、通知策略、deep 扩展、现役 Worker 重启/加载、生产回退和真实费用核对。任何一项都不能由 fixture PASS 或本设计文档代替。

## 交叉复核与变更记录

本稿依据 `worker/src/worker.js`、`worker/src/translationWorker.js`、`server/src/integrations/aiTranslator.js`、`server/src/db/repository.js`、`server/src/pipeline/alertEngine.js` 和 `overseasControlledManifest.js` 只读核对。员工复核指出：contentIds controlled 翻译会触发补入队；分析 broad path 会升级 deep 和推送通知；现有预算未绑定 manifest/provider/attempt。因此本稿保持隔离设计、生产 `NO_GO`，待经理审阅后另派实现单。
