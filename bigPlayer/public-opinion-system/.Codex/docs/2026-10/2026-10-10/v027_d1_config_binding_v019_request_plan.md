# D1 配置投影绑定与 v019 首源侦察计划

Status: SAFETY_PRECHECK_PASS / V2_INDEPENDENT_QA_VERIFIED / V1_PROJECTION_REJECTED / D2_D7_NO_GO / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

## 历史只读原件（v1 投影已退回，不作为 D1 hash 签收）

定向入口仍为 `scripts/overseas-d1-d2-d7-readonly.js`，本轮只增加非敏感配置投影的 canonical hash；未读取、未 hash、未输出 secret 正文。原件位于统一根 `.temp/overseas-d1-d2-d7-cTANaR/result.json`，SHA-256：`7680CDBBBAF4A19F3CD958E6A660C975850329E42BA966F0F09F02CFC0F5AF47`。

事务和目标门禁保持：固定本机回环 3306、server_id 1、MariaDB 10.4.14；`START TRANSACTION READ ONLY` → 白名单短 SELECT → `ROLLBACK` → `connection.end()`。没有 HTTP、token exchange、AI、写 SQL、DDL、ACL、服务或国内改动。

## 历史 v1 配置投影（不是整体发布版本）

每个 source 原件新增：

- `scheduleVersion`：当前数据库调度版本字段。
- `configProjectionSha256`：仅对以下 canonical 非敏感投影计算 SHA-256：`boardId`、base URL 的 origin/path/参数/hash、每个站点的 HMAC 标识、URL hash、enabled、authStatus、syncMode、historyStart、editionScope、startPaths 数量。
- `bindingFields`：`scheduleVersion`、`boardId`、`baseUrlSha256`、`siteHmac`、`siteUrlSha256`、`siteEnabled`、`siteAuthStatus`、`syncMode`、`historyStart`、`editionScope`、`startPathsCount`。

当前投影：

| source 别名 | source HMAC | scheduleVersion | configProjectionSha256 | boardId | 配置站点 |
|---|---|---:|---|---:|---:|
| SRC-A | `5c09c58e579bd0246451fbb5ce0ed210ab38b8ab686da01cf74095d0de6c873f` | 1 | `c7eabf3d1eb5bf9e5d2df4112c23b1154f227a14d9fb19454cfeac988aa4ba9e` | 100017 | 3 |
| SRC-B | `d8820eb6f9c55ee06d08df1695585a63dc8c05de73c25aead753a514ef458fe2` | 1 | `04d6aafbacb2f8d704ac705ef4d99c008866d3d7a5fc62932d41496f75a64b28` | 缺失 | 3 |

这些 hash 仅用于同一脱敏投影的变化检测，不能证明 token、board 或站点真实可访问。D1 仍缺生产配置发布版本/变更历史字段的独立合同；本原件只覆盖当前投影和 `scheduleVersion`。

## 与 v019 首源计划的精确绑定

`SRC-A` 的当前投影与 v019 首源候选参数一致：三站均为 `https://club-en.q1.com/`，`env=web`、`gameId=2177`、`gameVersion=2177-US-ZS`、`lang=en-US`，`languageId=2/9/16`，配置 board 为 `100017`。这只是静态配置绑定，不能把 registry 的两个 `unknown` 变成授权成功。

当前不存在已放行的真实 v019 执行器；`requestQ1` 仍带授权 session 获取、401 reauthorization 分支，`discoverFeeds` 仍可能尝试 v1 fallback，不能直接作为本次执行入口。若另行批准真实侦察，必须新增/冻结独立执行器：只接受 `SRC-A` 自身三站绑定，显式 endpoint/query allowlist，`redirect:'manual'` 且 redirect 预算固定为 0，自动 retry/reauthorization/fallback 均关闭；token 只在内存 session 中交换并复用，不写日志/文件，context/board 未成功前禁止 feeds。每站最多 8 个请求、全批最多 24 个；单并发、每请求 10 秒、总墙钟 5 分钟、实际请求逐条累计；scope 漂移、未知字段或 401/403 立即停止该站；不跨站借 descriptor/id，不调用完整采集、分页、评论树、AI、翻译或通知。

在 context/board 对每个站点返回可验证成功前，`auth_status=unknown` 的站点禁止进入 feed 请求；字段未知时停止并记录 `unsupported/UNKNOWN`，不得猜参数。login/token 属外部状态影响，若未来执行必须单独审批、单独计数、token 只在内存复用，日志只存脱敏状态和摘要。

## 结论与交 QA

本轮补齐了当前 D1 非敏感配置投影版本/hash及与 v019 首源参数的静态绑定；不改变 D2/D7 结论。`SRC-A` 两站授权仍 unknown，`SRC-B` 缺 board 且 registry 与三站配置不一致；D7 生产 scope cap、金额、失败/重试计费和 provider 合同仍未证。请测试负责人仅复核新原件 SHA、投影字段、v019 绑定和 READ ONLY 事务，不执行 HTTP/token/AI/写入。独立 QA 复核前保持 `QA_PENDING / FULL_RUNTIME_NO_GO / CUTOVER_HOLD`。

## 经理可审阅的精确影响方案

| 范围 | 允许动作 | 预算/时限 | 停止条件 | 当前状态 |
|---|---|---|---|---|
| `SRC-A` 自身三站 | 仅未来经单独批准的隔离侦察；每站先自身 token/context/board，再按同站 descriptor 取有限样本 | 每站最多 8、全批最多 24；单并发、单请求 10 秒、总墙钟 5 分钟；retry=0、redirect=0 | auth unknown 未经 context/board 成功、401/403、scope 漂移、未知 schema、任意 redirect | 方案已备，未执行 |
| `SRC-B` | 不执行、不借用 `SRC-A` board、registry、credential 或 descriptor | 0 请求 | 缺 board、registry/配置身份不一致保持整源停止 | `NO_GO` |
| 生产/国内 | 不切服务、不启第二 consumer、不写 SQL/DDL、不调用 AI/provider、不发通知 | 0 变更 | 任一动作超出上述边界即停止 | `FULL_RUNTIME_NO_GO / CUTOVER_HOLD` |

该方案只描述真实执行前的安全准备和影响边界，不构成真实授权、内容采集或费用批准。

## QA 退回后的 v2 安全修正

测试负责人安全预检发现：v1 的 `bindingFields` 声称含 scheduleVersion，但它没有进入实际 hash；safeUrl 遮蔽 query 值后仍 hash 原 URL，invalid 分支也 hash 原文。这两项已修正，旧 cTANaR 原件及上表 hash 保留用于问题追溯，不作为新投影签收依据。v026 已核收的静态事实不倒退。

当前入口 SHA256：`4A0097D866F6AEAD7D7929F5AA62F8397B4D4A7F3087805E547DA2235B0113EE`。投影版本为 `nonsecret-config-v2`。原件将完整输出 `configProjection`，`bindingFields` 自动取该对象的排序键，digest 等于其 canonical JSON 的 SHA256；所有对象键排序，数组保留配置顺序。顶层实际输入逐项为 `scheduleVersion`（字符串）、`boardId`、`baseUrl`、`sites`、`syncMode`、`historyStart`、`editionScope`、`startPathsCount`。每个 site 为 `siteHmac/url/enabled/authStatus`。这只绑定指定配置投影和调度版本，不是完整发布版本。

URL 合同：仅接受 `https://club-en.q1.com/`，拒绝 userinfo、fragment、非法 URL；query 只接受 `env/gameId/gameVersion/languageId/lang`，公开值须为 1–64 个 ASCII 字母、数字、下划线或连字符；重复公开键返回 `invalid`。secret/未知 query 键和值均剔除，既不输出也不参与 digest。URL `sha256` 仅 hash 输出的 `{origin,path,params}` canonical 投影，`hashKind=nonsecret-url-projection-v2`；invalid 仅返回 `{invalid:true}`。因此新 URL 投影摘要不能与数据库原始 URL 摘要直接比对。`storedUrlHash` 只是独立数据库原存摘要，不进入配置投影，也不代表匿名公开资料。

离线负例命令：`node --test server/test/overseasReadonlyProjection.test.js`，4/4 通过。覆盖版本变化、合法 site 参数变化、secret/未知值不影响 digest、query 顺序不影响 digest、非法 URL 不泄露及重复键确定拒绝。离线原件为统一根 `.temp/v027-projection-fixed-irhVyK/result.json`，SHA256 `8B487FCF0C54E6AE1DAB31EF2E8E11F31A3287F39BCB0415F6CFF4F247B9F0E4`，明确 `productionReadAttempted=false`；它是安全测试证据，不能充作生产采样。

下一步先交测试负责人安全预检。通过后才能按既有固定目标/短 SELECT/READ ONLY/ROLLBACK/end 边界补采新的唯一脱敏原件并交独立核收。此次未执行新生产 SELECT、HTTP/token/AI、写入或服务操作，D2/D7 和生产 HOLD 保持。

## 安全预检签收与 v2 开发补采（2026-10-10 05:05）

测试负责人已自行签收 v2 离线安全预检 PASS；其探针 SHA256 为 `75465F1CF724997482CB6EE029F8E8232216C589F26ADC40F571E056CC5959E8`，离线原件 SHA256 为 `88FC357F9462CE38B68A98C6E9739DC8A2E08E6F14BEB3268A057C476187B647`。该阶段 QA 没有连接生产库。

在此预检通过后，开发仅使用上述精确 SHA 的入口执行一次既有九条 SELECT 白名单。新脱敏原件：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-d1-d2-d7-dJSJqc/result.json`；SHA256 `A687D70E4B8FAD3B289D7AC094EC3223ACDC9405C427A7604A03492421FFB03C`。采样时间为 2026-10-10 05:05:56.106–05:05:56.165（Asia/Shanghai），原件 UTC 为 `2026-10-09T21:05:56.106Z` 至 `.165Z`。身份核对为回环3306/server_id1/MariaDB10.4.14/遮蔽schema，事务 `START TRANSACTION READ ONLY`，`rolledBack=true`、`connectionEnded=true`；原件状态仍 `NO_GO`。

当前 v2 投影摘要（只绑定指定非秘密投影，不是整体发布版本）：

| source | scheduleVersion | configProjectionSha256 | boardId | languageId |
|---|---:|---|---|---|
| SRC-A | 1 | `c991fbfe75340eab491f839dea92234b12f017620f252b6083ba3de4f1d02f7f` | 100017 | 2/9/16 |
| SRC-B | 1 | `aec49156b13f20638c9f556f394d45e4ea49c37a95a7680591681803fae08731` | 缺失 | 2/9/16 |

请测试负责人随后按已授权同一固定目标/白名单独立短读，比对同一 v2 投影 hash、首源三站参数和 board。尚未独立核收这轮生产补采，不代签 PASS。旧 v1 原件和退回状态均保留；D2/D7、第二源停止、真实HTTP/token/AI/写入/服务/国内门禁保持。

独立 QA 已签收：记录位于 `.tests/2026-10/2026-10-10/v027_d1_projection_binding_independent_qa.md`；QA 原件为统一根 `.temp/overseas-d1-d2-d7-5c2nvt/result.json`，SHA256 `8B22721480E4ED35C08AAF482EDC540AE2A9F8568DAECACDE3083067BFEB74D2`，采样时间 2026-10-10 05:06:55（Asia/Shanghai）。QA 从原件重算非秘密投影 SHA，并与开发 05:05:56 采样逐字段一致：SRC-A `scheduleVersion=1`、board `100017`、languageId `2/9/16`。该签收只覆盖当前投影绑定，不代表完整发布版本、secret 或真实授权；SRC-A 两站仍 `unknown`，SRC-B 缺 board 且 site 身份 `0/3`，D7 费用合同未证，不能据静态 hash 放行 HTTP 或采集。
