# 首源侦察真实身份/transport合同与精确影响方案

Status: DESIGN_ONLY / REAL_EXECUTION_NOT_AUTHORIZED / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

## 已签收与尚缺合同

Qqqk9O/v032独立QA只签可信声明式fixture/offline guard合成控制器。unknown三站9请求仅token/context/board模拟、feeds=0。v027独立签收的是05:06非秘密配置投影，不签凭据、授权或执行时新鲜度。此次只读代码和设计，没有SQL/凭据读取/HTTP/服务操作；不为已关闭缺陷再跑PASS。

| 既有路径及当前SHA256 | 可借鉴内容 | 不能直接作为侦察能力 |
|---|---|---|
| scripts/overseas-v019-isolated-runner.js（Qqqk9O runner锚4643937d53ba51a116b0f63757a763370311284140eea151b88b952348119a95） | deadline/预算、allowlist、输入快照与脱敏负测 | 内部合成身份/transport；没有真实source/account/site签发器，不能加live开关直通 |
| worker/src/overseasBigPlayerNetworkContractVerifier.js，BBED3620559E9A22F1F79875C22264F874C0731FF797E33DDD5F7909DEF9726F | source/account/game/community/site/board/URL及run lease精确核验 | 依赖真实running run/Journal，不能为无入库侦察伪造run或借恢复proof |
| server/src/connectors/overseasBigPlayerSiteSession.js，E594C54B718AE0DD04BBD528909CE031F62D904BBD0C916B9D3384DE2957778B | 同站内存token缓存、参数与account绑定 | 接受任意transport/记录callback，非侦察私有能力；失效后可再exchange，timeout不等现控制器唯一deadline合同 |
| server/src/connectors/bigPlayerH5Connector.js，3B26DE830FD380BCDABB12D4F14417E898094477EE19FB31739B9E3B22D10B4D | endpoint/schema与归一化事实 | requestQ1有401/403 reauthorization；discoverFeeds有v1 fallback，详情包装可多请求；禁止直接复用完整调用链 |
| server/src/services/credentialContext.js，D5CD905649701934977ED76F3C8F2BB439651AF096CE3FD2C684C8E477086240 | active/期限/AAD解密检查 | 默认允许legacySourceFallback，返回refreshToken/secretObject；需专属仅api_token能力、禁止默认账号或回落，不能直接把返回对象交日志/runner |
| scripts/overseas-d1-d2-d7-readonly.js，4A0097D866F6AEAD7D7929F5AA62F8397B4D4A7F3087805E547DA2235B0113EE | v2非秘密投影/固定目标短读边界 | 历史reader含D2/D7额外范围且不读secret；不能扩大既有只读授权为凭据读取 |

## 技术选择

推荐新增侦察专属签发器+专属transport模块：仅消费已审核批次请求合同，内部创建能力，隔离测试用数据夹具，不开放任意callback签发。这样无需run入库，也不改变国内/shared Worker。

备选复用connector并配置禁refresh/fallback：依赖较多，错误路径可能带隐式exchange或额外请求，须证明每条分支，非本单推荐。备选将合成runner接受外部fetch：签发/身份/凭据合同仍缺，扩大已QA范围，不能只加开关声称完成。

## 新签发合同（未实现）

签发器固定读取单一批准source的非秘密身份快照，绑定 sourceId、accountId、credentialId/type/status/期限、game/community/region/platform、boardId、三站registry siteId/URL hash/enabled/authStatus、v2 configProjection hash/scheduleVersion、代码manifest hash、request-plan hash、批次随机nonce和有效截止。无唯一active api_token、账号跨source/game/community、站点缺失/重复、URL未知键、registry对齐失败即拒；不得猜account或复制另一源。

HMAC标识只用于脱敏关联，不构成授权签名。能力使用进程私有品牌及不可变快照；外部对象复制、跨批次/跨站凭据、过期和manifest变更拒绝。当前安全输入仍是可信数据，Proxy不是无副作用沙箱。生产签发来源与读取目标必须另获具体授权，fixture不能签成生产能力。

凭据仅批准的account+credentialId api_token读取并在内存解密，不查询密码、不读取refreshToken、不legacy fallback、不刷新、不落盘。若credentialId或期限/状态未能精确绑定，整批HOLD。读取前后按同非秘密版本检查漂移，dispatch前再核有效能力；跨网络请求不可声称数据库锁可保证上游身份始终不变。需要执行时的短读次数/精确SELECT清单在实现后列出并单独审，不借05:06旧采样作为当前状态。

## transport合同（未实现）

模块内部持有单一HTTPS origin与精确endpoint/query白名单，不能传调用方任意fetch/handler。默认执行关闭；隔离fixture与未来受批次授权的真实能力分别品牌，不能互换。实际发包前原子消费站点及全批额度，attempt=1；拒redirect/reauth/retry/fallback/额外enrichment。request+body读取/解析共用absolute deadline，批次独立timer和AbortController，不接受调用方clock。

新增建议硬限每响应解码后JSON字节1 MiB，总8 MiB；超限停止整批。须以实际流读取限制及无可恢复错误原文验证，不能靠Content-Length声明或response.json之后计数。限制属于本方案建议，隔离负测验证后由经理收口，不推断上游接口必然支持。节点运行时、HTTPS代理/DNS、自动redirect/retry与body cancel合同须明确；不执行真实DNS/TLS验证。本机hosts/proxy不得写改。

## 首源精确影响与执行前门禁

目标仅 `081a16d2-5545-4afd-9c65-e04777e4540b`（SRC-A），board100017，历史投影三站origin `https://club-en.q1.com/`，参数 env=web/gameId2177/gameVersion2177-US-ZS/lang=en-US/languageId2/9/16。真实accountId/credentialId/siteId精确执行清单待签发器从批准自身绑定生成，不能靠HMAC反推或猜；三站同origin和language不同不证明真实分站。SRC-B请求预算0，保持缺board/registry不一致停止。

| 项目 | 拟执行边界 | 影响与待确认 |
|---|---|---|
| 配置及凭据读取 | 批准后仅SRC-A自身短READ ONLY身份核验、唯一api_token内存解密；不跑D2/D7宽查询 | 新secret读取尚未授权；精确字段/次数/目标/账号待实现后冻结 |
| 请求数量 | 默认先三站认证-only，每站token/context/board共3次、总≤9 | token exchange即使GET也有外部授权状态变化；结果未知不重放，不更新registry auth |
| 有限feeds取样 | 经同一审批明确允许且自身context/board成功后才按v019八槽表执行，各站最多8、总≤24 | unknown不能由fixture PASS升级；真实成功证据也是本批临时能力，不写数据库授权 |
| token生命周期 | 每站最多一次exchange，root/site token仅内存，同站后续复用；结束引用释放 | JS无法承诺string物理安全擦除；不持久化、不日志、不core dump采集；远端exchange不能撤销未知影响 |
| 时间与费用 | 串行；每请求10s、全批5min，retry/redirect/fallback=0；费用/限流合同未知 | 无AI费用；上游请求费用/额度需经理确认，不声明免费 |
| endpoint | 沿v019计划token/context/v2 board/post list/activity/单detail/comment/reply；descriptor和ID同站来源 | 仅认证-only放行时feeds/detail/comment/reply额度0；缺feed/样本unsupported不转额度 |
| 脱敏 | JSONL仅scope摘要/code/形状/hash/序号/elapsed；ID用每批随机HMAC，query凭据不记；错误仅允许码 | 无provider raw/body/正文、无token/cookie/header/原ID；随机HMAC key不入版本库，不沿固定fixture salt用于生产 |
| 输出 | 仓库根批准的唯一.temp证据目录，原件只非秘密元数据，manifest/hash及停止原因 | 本轮不创建真实证据目录/ACL；保留期限/清理owner由经理定，删除不在此单 |
| 停止 | 身份/配置漂移、任意redirect、scope冲突、401/403/429/5xx、未知JSON/schema、超时/超预算 | 推荐整批停止，余下请求0；与旧计划“部分站失败继续其他站”不同，执行前统一为此保守合同 |
| 回退 | abort在途，关闭响应/连接，清内存session，留脱敏最后状态；不重试/补写/刷新 | 无服务版本或DB变更可回退；远端token影响未知标AUTH_EFFECT_UNKNOWN，不能宣称撤销 |

完整24槽的method/endpoint/query详见当日v019_real_site_observation_request_plan.md。批准必须明确是9次认证-only还是最多24次有限取样及unknown处理，不能将9次模拟预检当真实采集许可。实际执行时全部slot和冻结identity需齐，任何待确认未闭合即不执行。

## 国内零影响证据所需

代码依赖闭包不导入worker main/buildDeps/scheduler/authRefreshCoordinator；无Repository写能力、无迁移/SCM/XML/release文件操作、不抢13316/国内端口、不启动consumer。隔离负测证明无DB写/run/job/marker/audit、无通知/AI、非目标source/site拒绝、无env与默认DB回落。冻结清单逐文件显示仅专属新模块/测试/计划。

这些可证明本工具不主动改变国内链；与国内共享机器资源和上游账号配额仍可能有竞争，真实上游配额/账号共享是否影响国内待证。只观察PID持续不能证明国内抓取正常或零影响。国内零影响证据未齐时保持HOLD；不能擅自访问国内Worker来补证。

## 最小隔离补齐顺序

| 小单 | 隔离产出 | 独立验收目标 |
|---|---|---|
| I1 | 非秘密数据签发器与credential能力边界，生产入口关闭 | 错source/account/site/registry/version、复制能力、过期、unknown无许可、secret不输出、无默认回落；不读真实secret |
| I2 | data-only专属transport计划与受控流fixture，真实网络关闭 | 24/8与9-only预算、唯一deadline、body大小/JSON停止、redirect/retry/reauth零、token同站复用、脱敏错误 |
| I3 | 完整批准清单/冻结manifest/影响与停止回退方案 | 独立QA限定隔离PASS；不复用Qqqk9O签收代新合同QA |
| 真实动作 | 精确身份清单、短读与token外部影响、9/24选择、配额与证据保留齐后由经理统一办理用户决定 | 未批准前HTTP/secret/SQL/服务操作全部0 |

本稿为可审方案，不是已实现签发器/真实transport。四组外围无端口补验另单实施，不替代首源真实交付；生产runtime、持久恢复/shared切换、AI和v104整批仍NO_GO。

## 变更记录

仅新增设计与精确影响稿，核既有路径及文件hash。无代码/配置/SQL/HTTP/服务变更，无测试重跑。沿经理派单交评阅后再执行已授权的隔离小单，不自行执行真实操作。
