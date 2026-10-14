# 国内读取候选与 Last Night 隔离认证交付

Status: QA_PENDING / PRODUCTION_NO_GO，2026-10-09。

## 国内冻结候选

仓库根目录为 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage`。
新候选位于根目录 `.temp/bigplayer-recovery-20261009/v019-read-compat-vgfxk2`。
正式完整清单为该目录 `package-release-manifest.json`，395 项逐文件校验通过；现役基线为 `C:/ProgramData/PublicOpinion/releases/v019-lastnight-token-20261008`。

| 文件 | SHA256 |
|---|---|
| repository.js | f6b73474a329861e12469d58918c5d272478b89fff6f5f606cb59464cef1343e |
| app.js | 32737749da6217e4e3f12ceeb632d1b1d4328c415682c1602ef73eb3b4193e97 |
| package-release-manifest.json | 2cb014364222f660d07e4c324b4f241a6a6ff1ebe6ace2a62ef4f9f385d45f06 |

只相对现役改变 `server/src/db/repository.js`、`server/src/app.js`：六缺列 NULL 兼容、列表先 ID 分页再详情、latest 先 ID、国内来源列表按 scope/status 摘要。详情与 getSyncStatus/reset 契约不替换。

旧 FwThse 的独立 QA 发现错误原因丢失，标记 FAIL_UI_ERROR_SUMMARY，旧包和来源报告保留。新包仅增加每 scope 首个非空 checkpoint 错误：按旧 root_platform_content_id 顺序选择，不用 MAX(error_message)，同 root 的旧未定义顺序以 id 确定。每 scope 错误附在摘要行，前端仍按 STAGES 选首个错误。前端未为本缺陷改动；此前 pending 汇总补丁 hash 为 e7a50696141b1455aa44fef4bd2d19cfe7cad29bd00cb2a9421657380976af88，属独立静态资产，不在 API 包内。

7/7 定向测试通过，日志根目录 `.temp/bigplayer-recovery-20261009/vgfxk2-targeted.log`。命令：设置 `PO_ISOLATED_CANDIDATE_ROOT` 指向新包，运行 `node --test server/test/v019CandidateStartup.test.js server/test/v019ReadCandidate.test.js server/test/sourceSyncSummary.test.js`。

隔离命令 `node scripts/sync-runs-schema-compat-isolated.js --isolated`，固定 127.0.0.1:43321，独立 MariaDB、独立 datadir、SELECT-only fixture 身份。结果根目录 `.temp/sync-runs-compat-20261009/mariadb-kIZZAI/result.json`：74714 行→8 行；items_fetched=149428、pending=37358，完整/摘要一致；16,370,966→1,433 字节，194/179ms；多错误首项顺序、无错误 null、无需 source.last_error 场景通过；实例停止且端口释放。这是合成规模，不是生产耗时承诺。

离线启动防写测试在 require(app) 前替换 mysql transport、fetch、env 加载、timer、listen：1 pool/0 query/0 external/0 timer/0 listen；未导入 migration/worker/consumer。候选 app 1948 行 require.main 分支才启动 supervisor；Repository 构造仅 createPool。此证明不等同真实 DB 权限，也不证明历史探测前后生产文件无变化。

FwThse 五 GET 的真实 HTTP200 是旧 hash 的技术来源证据，不继承成新包真实验收。原报告中 productionFilesModified=false 为直接赋值，不能用于放行；未比较 app 和现役文件，后续不得补造历史 hash。

## Last Night 离线候选

新增 `server/src/connectors/lastNightSiteSession.js`，通过显式隔离 transport 注入 Connector；无环境开关、无现役接线。仅固定 Last Night source / club-en / game2177 / gameVersion2177-US-ZS / board100017 / 正整数 languageId。

GET 交换 query 按公开 runtime 包含 token、sdkToken 空字符串、gameId/gameVersion/languageId，Authorization 原样；code 严格为数字0且有 token 才成功，code1 游客立即失败关闭。分区 key 含 source/account/origin/game/version/languageId/原 token SHA；token 只内存，401/403 清缓存且不刷新共享凭据。证据钩子不含 token；交换错误不传播原 URL/response。现役直接 api_token 和国内 Bearer 行为不变。2/9/16 不推测语言码。

`worker/src/lastNightSiteAlignment.js` 增加精确 rollback：批准 beforeConfig/after hash/两新 site ID；锁 source/active run/lease；重新计算原计划；新站已有任何 run/checkpoint 时拒绝；CAS 恢复配置并仅 disable 新 registry，不删除历史。没有生产 CLI 接线。

12/12 离线授权+registry 测试通过，日志根目录 `.temp/bigplayer-recovery-20261009/lastnight-offline-candidate.log`。三站实际调用现有 discoverFeeds 和 listFeedContents，feed/详情使用各自站点 token，不重复交换，feed 不额外加 languageId，帖规范化 board100017；原直接 token 回归通过。没有真实 HTTP、DB 写入或 Store。

既有技术探测三站 HTTP200/code1=TouristLogin，只为不完整诊断：缺逐请求时间和参数签名，不能补造；有 token 生成但未 context/feed，不等于上游无会话。有效旧 api_token 的直接 context 曾成功，此次游客结果不证明旧 token 失效。

完整新包仍待独立 QA，不提交或推送未放行候选，不切服务。

交接后补充：隔离 auth 请求的 transport 异常也包装固定消息，避免错误包含站点 token；Connector 最终 SHA 为77bf9189fd138f90febecefeb12bb6732a8f5dcafd11b3187b286b1464ece36e，12/12复跑日志为根目录 `.temp/bigplayer-recovery-20261009/lastnight-offline-candidate-final.log`。国内 v019ReadCandidate 追加 getSyncStatus/getSyncCheckpoint/resetSyncCheckpoint/pauseSyncCheckpoint 与基线逐字相等断言，5/5通过，不改包 hash。
