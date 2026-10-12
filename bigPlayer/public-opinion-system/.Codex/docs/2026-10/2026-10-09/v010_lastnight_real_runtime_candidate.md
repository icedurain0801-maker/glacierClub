# Last Night 独立真实 CLI 候选

Status: INDEPENDENT_QA_PENDING / NOT_DEPLOYED。国内PASS后冻结，海外未发真实请求或DB写入。

## 已实现

`scripts/lastnight-bounded-runtime.js --approved-plan <绝对json>` 已有真实transport/既有runtime账号配置接线，不再无条件拒绝execute；必须approved/固定授权模式/自身hash/依赖hash/account/identity/窗口/独立output绑定。固定127.0.0.1:3306/public_opinion、显式DB_USER，不读取DATABASE_URL或默认换账户。导入CLI不读env、不造pool、不导入shared worker。

resolver仅使用既有CredentialContext读取api_token（active/有效期/AAD解密由既有实现），绑定account归固定source；不读取password登录、不刷新/生成SDK凭据、不输出token。现有Repository.getCredentialByAccount返回列没有source_id，source关联从已核account取得，不能错误要求返回不存在字段。URL全体校验先于解密：env=web/lang=en-US、game2177/version2177-US-ZS、language2/9/16、重复/未知参数拒绝。

`tokenMode=direct-api-token` 使用原token原样header，不自动交换、不推断旧token失效；`site-exchange` 显式走同网页GET query token/sdkToken空/game/version/language、header原token，strict code0后context/v2board。每种模式明确独立，不自动失败后切换路径。

阶段metadata只context/board（交换模式另1请求）；collect单站board100017 merged首页一页≤20、只窗口内详情≤20；最多24HTTP、逐10秒、全阶段120秒软窗口、无重试/跨域/额外feed。GET/endpoint query固定，详情postId只来自该页。实际page.hasMore写报告，样本不宣称全日完成；空样本EMPTY_SAMPLE并非PASS。

store-ai只精确当前account/source/board：使用现役Worker同名账号互斥锁public-opinion-sync-account-${accountId}、timeout0，active run拒绝；registry该site/url不齐拒绝。normalizeRawContent复用现有fingerprint后upsertContentPage；不传syncRun/checkpoint，因此不伪造完整采集run或改断点。写集合po_contents、po_content_feed_memberships，以及新增/变更精确IDs的po_analysis_jobs，队列force:false。不运行Q1AnalysisRunner，不开consumer、不争抢po-analysis-consumer，也不重写算法。结果STORE_COMMITTED_AI_QUEUED明确只入队，不是AI完成。已有异步服务是否实际消费/完成需QA现场限定IDs证据，未宣称已完成。

## 冻结材料和测试

仓库根 `.temp/bigplayer-recovery-20261009/lastnight-runtime-AIkAwB` 含manifest.json、plan.unapproved.json和last-night-overseas-daily.candidate.cmd；源码依赖hash绑定，不包含env/凭据/shared Worker。模板stage metadata、direct-api-token、account/identity null，由经理绑定已有值后执行；模板不是重问普通权限。

| 源码 | SHA256 |
|---|---|
| scripts/lastnight-bounded-runtime.js | cfb5f4c531e33b196fe6740b9726d01814ddc9cc9ae7bf76fd22488c9a3862f3 |
| worker/src/lastNightBoundedRuntime.js | 6cf5b913c4243c3ba357988cf79ff7ef1245624e4d6fc5d2d7411549d1ae9d36 |
| worker/src/lastNightRuntimeResolver.js | 09fe70420e2558af30f55b73244b48b7fcea29682649e5fdb0d1df681d1f3b2a |
| server/src/connectors/lastNightSiteSession.js | 71144f25167502d0a5aa864e4a04a077fcd33bd03e6b0e544edadaaba593a93d |
| server/src/connectors/lastNightUrlContract.js | 6585f31c9eb4d3f0546c6bec26c913b3c4c7015a5e1d7585a891fcd4f611628a |
| scripts/lastnight-authorization-check.js | 6f2f837cbcaec2e198dc4f0d0e9abe38264f4fff8dda5ca4cdc286dd45b71f26 |

`node --test worker/test/lastNightBoundedRuntime.test.js server/test/lastNightAuthorizationCheck.test.js` 8/8 PASS，根.temp/bigplayer-recovery-20261009/lastnight-runtime-final.log；旧session加测曾12/12，非最终全包QA。测试fake repo/transport：direct vs exchange、游客无写、wrong identity、single page/精确Store与queue、import无DB/Worker、env/lang/duplicate负例。语法/空白通过。

## 仍需独立QA收口的风险

目前Store事务由既有Repository保证，入队在随后单独事务：Store已提交但queue失败不能声称全部失败回滚，须按报告精确IDs重入队，不删除历史/不重复改正文。变化内容原行备份/CAS人工恢复材料尚未加入CLI，未满足自动完整回退；QA前不现场store-ai。依赖manifest按存在文件选取，需QA核实际全递归依赖覆盖/缺必需文件失败。Runtime DB getConnection/事务query timeout与自有池清理仍需故障QA，不称硬120秒。URL合同仅既有已确认en-US，不映射languageId成新locale。

任务候选cmd未落现役缺失路径、不更新Ready任务；只接受显式--approved-plan，传播非零，不运行shared Worker。真实单日防重不仅需要账号锁，还需已完成日窗口/run identity，当前采样无持久日run，故不能将该cmd用作全日调度生产恢复。后续需独立持久日身份最小候选及实际Store/AI/任务证据；这仍未交付PASS。现阶段先经理串行metadata→collect，QA通过Store/回退后再store-ai，真实Task保持不动。

无DDL/push/删历史/国内Worker或任务变更。本文每阶段标记与风险用于准确交QA，不将可运行CLI等同已放行生产链。
