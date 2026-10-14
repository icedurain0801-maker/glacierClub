# Last Night 固定源只读与认证候选

Status: offline-candidate-production-no-go
Date: 2026-10-08

## 本阶段

- `worker/src/lastNightReadOnlySource.js` 仅接受受控目标配置、明确的 account ID 和预期实例身份；首查询核数据库身份，再核 `SHOW GRANTS` 仅有白名单表的 `SELECT` 与全局 `USAGE`，再核必需列，最后在只读事务内按固定 source/account 参数化读取。任何漂移在业务 SELECT 前失败关闭。模块没有生产连接入口或默认账号。
- `worker/src/lastNightIsolatedAuth.js` 复用现有 `CredentialContext` 的受控解密与上下文校验；只要存在 `account_password` 行，无论状态如何均阻断 Token 兜底，当前无不写共享会话的独立登录实现时返回 `LAST_NIGHT_PASSWORD_LOGIN_UNAVAILABLE`。仅完全无账密时解析 `api_token`，给 BigPlayer connector 一个仅含 `loadApiToken` 的临时上下文；不注入 `loginSessionClient` 或 `authRefreshCoordinator`，401/403 无刷新。
- 离线假连接测试 5/5 PASS，覆盖实例身份、跨库/写 GRANT、缺列、固定参数、账密优先、缺 Token/密文及 401 单请求。测试未连接生产库、未调用真实 API、未解密真实凭据。
- `lastNightIsolatedPipeline` 增加每个 Run 30 秒独立 lease 心跳，并在完成/失败前等待心跳收束；请求前后续租仍保留。短间隔慢请求离线测试证明请求未返回时也能续租，旧 epoch/owner 仍由 Store CAS 拒绝。
- `worker/src/lastNightIsolatedAiConsumer.js` 提供独立进程可调用的轮询函数，只接受 433xx 隔离 Store；无生产启动入口。离线测试覆盖消费与 abort 停止。
- `worker/src/lastNightIsolatedReadModel.js` 只接受 433xx 独立库的专用 reader 身份和两表 `SELECT`，每次连接核实例与自身 GRANT；列表按固定 source/board/site/半开时间窗读取并支持 keyset 翻页。分析结果经内容 JOIN 同时核 source/board/site 与当前 fingerprint，只投影允许字段。定向假连接测试 3/3 PASS；尚无后台 API 调用方或前端入口。
- `worker/src/lastNightIsolatedStore.js` 入库复用已经通过半开时间窗校验的发布时间值，修正 `published_at` 可通过校验却写入 NULL 的路径。43319 隔离库 E2E 用 snake_case 帖子时间回归，14 contents / 14 tasks / 28 jobs / 28 results，崩溃游标恢复和最小权限通过，实例停止且端口释放；未连接生产库。
- `scripts/lastnight-production-reader-audit.js` 为单次 privileged DBA 只读盘点候选，受限证据目录的一次性标记防止重复执行；连接前核受控管理身份，首条 SQL 核目标实例与会话身份、无激活角色。只输出 reader 白名单权限布尔摘要和固定 source/account 凭据形态，不输出原始 GRANT、密文或口令。首次现场预检在本地 ACL 门禁处停止，详见下文；新候选尚未执行。

## 一次现场预检与离线修正

首次冻结脚本 `16D5833821B550BBCF80D9E4C61F4CEB003F9893EA91A8D90402624FBCBAAE04` 经独立预审通过后执行一次，在本地 ACL 判断处以 `AUDIT_ACL_UNSAFE` 停止；`connectionAttempts=0`、`queryAttempts=0`，未读取 env、未连接生产库、未生成结果文件。受限失败目录的 ACL 只含预期管理主体，但旧判断误拒继承权限形式。固定 once 标记未创建，未重试旧脚本。

按项目经理指令仅离线修正 ACL 判断：三个精确主体均接受 `(F)` 或 `(OI)(CI)(F)`，仍拒绝 Users、Authenticated Users、Everyone、未知主体及其他权限；现役 env 的 LOCAL SERVICE `(RX)` 和操作者 `(RX)` 保持原门禁。新脚本 SHA256 `125DF330C7A7DCBCD7EA456F1046CD1820B7C624F0A5D9AE826D176108009814`，测试 SHA256 `7D2211A41E29A2C4018A1468478BB477EAF4A53DD0FC7EC533F3BB70434B4152`；离线 7/7、语法检查通过，现役 env 与失败目录 ACL 只读检查均为 true。测试负责人独立预审 `PASS_READONLY_AUDIT_PRECHECK_REVISED` 后，项目经理单独批准新的一次现场尝试。

新脚本只执行一次，结果 `AUDIT_TARGET_CONFIG_MISMATCH`，`connectionAttempts=0`、`queryAttempts=0`，没有连接生产库。受限结果文件 SHA256 为 `0C8510BCA236CEFE919B02E7A0D932DCBA1E290898527850AF9001DF98E3F7B8`；固定 once 标记已消耗。后续只读布尔诊断确认目标非秘密字段匹配，但受限 env 的口令非空门禁未通过；未输出配置值或口令。不能借用其他凭据、改 env 或重试，待项目经理决定受控凭据设施路径。结果已交测试负责人独立核验。

## UTC 读模型补修

测试负责人先对旧候选给出隔离通过，随后因读模型 `DATE_FORMAT(...Z)` 未设置 session UTC 撤回为 `NO_GO_PENDING_FIX`。现在每个读连接在身份和只读 GRANT 通过后执行 `SET SESSION time_zone='+00:00'`，失败即释放连接且不查询内容；列表要求显式时区的半开窗口和游标。新增 `+08:00` 入参换算 UTC SQL 边界、无时区拒绝、UTC 设置失败关闭的测试。新读模型 SHA256 `46790F81D03EFC772EBEBCC3D44186940EB596353F6C4878409D8C2FF94E8216`，测试 SHA256 `12FAD609170F3E6F0B8CFFA75F54459BFC63A2AAC30D057B5B2B6D41672BAAD5`；开发侧当时定向 4/4、Worker 全量 306/306 PASS，不能沿用旧 hash PASS。

测试负责人对上述精确 hash 独立复验并给出 `PASS_ISOLATED_READ_MODEL_UTC_FIX`；只恢复隔离候选口径，生产仍 `NO_GO`。

## AI 长请求续租候选

`LastNightIsolatedStore` 新增分析 job 的 owner/epoch/未过期 CAS 续租；`consumeIsolatedAnalysis` 在分析批次运行时周期性续租所有未完成 job，完成或失败前等待正在执行的心跳收束。慢 AI 请求测试覆盖后续 job 在首个请求期间续租、租约丢失拒绝写结果；43319 E2E 覆盖正确 epoch 续租与错误 epoch 拒绝。Worker 全量 308/308，定向 11/11、隔离库 E2E `14 contents / 14 tasks / 28 jobs / 28 results` PASS，实例停止、端口释放；无真实 AI 请求。

AI 候选 SHA256：`worker/src/lastNightIsolatedStore.js` `079FEFAB7B878443BC55745A5998A10747CA27A7BAB89804FB758891850D2DDA`；`worker/src/lastNightIsolatedPipeline.js` `5FB577A93B5BCE5243C026477E62AE7A822D5136A574AFA617630C8BA28DAFEF`；`worker/test/lastNightIsolatedPipeline.test.js` `E378D886C2F43E3FA1DD0A2D8920FBEDD3F8DB13AB3F9D9AE3349C1EC904D488`；`scripts/lastnight-isolated-db-e2e.js` `FE5C0FB4010E9F60E13AE3701B1F0CD9BEB559DABA6C74782623B6D82B26AD2C`。该差异待独立 QA，不沿用旧候选 PASS。

测试负责人已对上述 AI 精确 hash 独立复验并给出 `PASS_ISOLATED_AI_LEASE`，Worker 308/308、43319 E2E 通过；仅隔离候选，生产仍 `NO_GO`。

## Activity 类型接线候选

真实 BigPlayer H5 Connector 的海外圈子 feed 会返回 `contentType='activity'`；原隔离 Pipeline/Store 只接受 `post`，真实活动一出现即失败。现在仅在帖子范围额外接受 `activity`，评论/回复范围仍禁止帖子或活动类型。离线 Pipeline 测试覆盖活动根内容与评论任务；43319 E2E 直接核活动类型及 snake_case 发布时间落库。Worker 309/309 与隔离 E2E `14/14/28/28` PASS、端口释放；未调用真实外部 API。

本差异新 SHA256：Store `BC8CDCEE7292E427964BDBAAE9F0FC27D675D10D770F2BC1C241EA111F2E8529`；Pipeline `D659CFEF9DE2C685A597E31D076AF55291E2C114B2CEDA893274BC3C12467110`；Pipeline test `CF4F6979F6725CDC0BE0401BE514D1940131C8A70706DC04ED4A8969B8789172`；隔离 E2E `9E5D09BEF777D6BF98F7C43285164AE257818BB8BA52CB6C4E1734CAB00C2418`。待独立 QA，不能沿用 AI 子项的旧 hash PASS。

测试负责人对上述 activity 精确 hash 独立复验并给出 `PASS_ISOLATED_ACTIVITY_SCOPE`，Worker 309/309、43319 E2E 通过；仅隔离候选。

## 真实 Connector 三站门禁修正候选

撤回旧版“真实 Connector 三站各写入一条 activity”的正例：夹具三站 URL 仅以 `site=1/2/3` 查询参数区分，而 Connector 对绝对 `/api/...` 路径发请求时不带该参数；旧正例不能证明上游三站数据互异，也不能作为三站执行验收。

现在 `collectIsolated` 对真实 `BigPlayerH5Connector` 在任何 Store 或 HTTP I/O 前比对 context 请求的 origin、path、query 与语言；签名碰撞报 `LAST_NIGHT_UPSTREAM_SITE_COLLISION`。仅语言不同仍不能证明数据域互异，报 `LAST_NIGHT_UPSTREAM_SITE_IDENTITY_UNVERIFIED`。执行器也在 `freezeSites` 前调用同一准入门禁；普通对象包装的真实 Connector 未经显式隔离夹具登记会报 `LAST_NIGHT_FIXTURE_CONNECTOR_REQUIRED`，无法意外绕过 `instanceof`。显式登记仅用于隔离测试，不构成生产 Connector 放行。隔离库 E2E 实际结果为 14 contents / 14 tasks / 28 jobs / 28 results、真实 Connector 三站零 HTTP/零 Run 写入拒绝；另用单站真实 Connector 加 fake fetch 验证 context、board、activity、detail、comments 协议解析 1 条活动、5 次模拟请求，但不写库。实例停止且端口释放；未访问真实外部 API 或生产库。Worker 全量 311/311、`git diff --check` PASS。

本次待独立 QA 的精确 SHA256：Pipeline `80C1239CE1954D5B1D707348ABB1575DE0BE47017D49EBDBD29990DE6E68FBEB`；Executor `3D3AEB15121DBEC0462B6BC3EAD22A3BC01F1A91014262B77D8C3566FCB3C3CE`；Pipeline 测试 `0B536E13AF599EB638E62AFC874DADB4E33945DE5912487728A49E75213F3AA6`；Executor 测试 `6C49704D0D31EE7560A1BD9C20E7F47994BFCC0EDDF9534589590E21C1257B52`；43319 E2E `C3A42C2D8A1378A0AE82FF7FCE14BCDCCF0DE4CEBC224E9475465397B39CC643`。旧 hash 的通过结论不得沿用，真实三站上游身份仍待外部合同和脱敏证据确认。

## 对 v024 的修正

`v024` 中“按外部密钥引用从既有密钥存储读取”只是候选路径，并非当前代码能力。现有 `CredentialContext` 要求可直接解密的受控凭据材料及匹配的上下文绑定；它不会自动解析外部引用。若现场只有引用，必须另做受控 resolver 并验证后才能继续，不能无声回退或借用共享写会话。

## 仍为 NO-GO

尚无符合白名单表 `SELECT` 的专用生产账号、受控口令设置/保存设施、确认过的实际实例身份和该账号凭据形态；两次获批现场脚本均在连接前失败，生产库连接次数仍为 0。本阶段不执行 GRANT/DDL，不以管理账号作为采集 reader，不触发真实登录/API/AI。账密存在时独立登录尚未实现；三站冻结身份、真实请求到独立库、长请求心跳的真实网络验证、异步 AI 与带鉴权后台只读 API 须另交 QA。生产执行继续 `NO_GO`。
