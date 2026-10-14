# v019 首源隔离侦察执行器候选

## 当前修复记录

独立签收已收：当日QA v032 对 Qqqk9O 限定 `ISOLATED_SYNTHETIC_CONTROLLER_PASS`，两轮14/14、独立负测12/12（24嵌套symbol组合getter=0），前后bytes/SHA一致。仅可信fixture合成控制器，不是实际授权/transport/抓取/生产PASS；FULL_RUNTIME_NO_GO/CUTOVER_HOLD保持。下面QA_PENDING是交接时历史状态。

QHBPyb 独立 QA v031 退回嵌套 symbol 静默丢弃缺陷后，当前改为 Qqqk9O 新冻结，完整锚见 v029 顶部。先加回归复现 Missing expected rejection，再将 dataSnapshot 改为 Reflect.ownKeys 遍历 descriptor 全键；在复制前拒所有 accessor 与 symbol。新增 account/source/site/sites数组/fixture/深层对象共24种可枚举或不可枚举symbol数据/accessor组合，getter零调用。冻结开发14/14通过、unchanged=true；仍独立 QA_PENDING，旧QHBPyb保留NO_PASS。本次无SQL/HTTP/服务变更。

最新候选为根 `.temp/overseas-v019-isolated-candidate-QHBPyb/`，取代已被独立 QA 退回的 ZlQ9KK。入口改为 `run(input)`，先检查普通对象与自有属性描述符，拒绝全部顶层 accessor、symbol、未知键和继承输入，再从 descriptor.value 捕获字段；嵌套数据快照拒 accessor、函数、非普通对象及循环。新增顶层 getter、嵌套身份 getter、symbol/继承输入负测，拒绝时 getter 零调用。开发冻结测试 13/13、exitCode=0、unchanged=true；独立 QA_PENDING，证据和哈希见 v029 当前交接。反射可能触发 Proxy trap，本实现仅接受可信数据输入，不是恶意 JS/Proxy 沙箱。unknown 的 9 请求仅为合成 probe-only，不代表真实采集、身份绑定或授权；FULL_RUNTIME_NO_GO / CUTOVER_HOLD 保持。

以下 ZlQ9KK 与更早版本均为历史修复记录，不是当前放行结论。

EJxUjH独立QA退回已落实到新ZlQ9KK冻结包，详见v029顶部当前交接。移除任意回调签发能力，仅内部声明式fixture；内部单调真实墙钟及独立批次timer；transport/JSON唯一absolute deadline；comment精确单层数字ID且与query一致；unknown受控认证模拟不放feeds。10/10开发测试由冻结副本在网络guard下执行，实际原件kind为DEV_TEST_EVIDENCE，前后hash一致；尚未独立QA签收。历史原件/包保留，下方旧“品牌不可伪造/共享deadline”等结论已被独立QA退回，不应作为当前证据。

Status: DEV_TEST_EVIDENCE / QA_PENDING / REAL_HTTP_NO_GO / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

## 现有路径审查

现有 `server/src/connectors/bigPlayerH5Connector.js` 的 `requestQ1/discoverFeeds` 不是本单真实侦察入口：它会通过 site session 获取 token，包含 401 reauthorization 分支，`discoverFeeds` 还可能尝试 v1 board fallback；普通 connector 还带 provider 分页/重试语义。v019 因此只保留为计划，未直接接入现有 connector、共享 Worker、数据库或真实 fetch。

## 新候选

P1 修正版当前冻结目录：统一根 `.temp/overseas-v019-isolated-candidate-EJxUjH/`；manifest SHA256 `653F771E98CAEBA9940DB1DE632EEE51C40889E45F97B0A00BFDEDE85007C5EC`；runner SHA256 `4EE419A76C3AF6B191716B890AC0D4CF87E307DB56BED67AD1D40504FB77BC5D`；test SHA256 `717B676E5D541EDE0C516348CF9454CC2C2B4906FC9E5D533491187EB46C4E1A`。旧 y201tO、mdmmhK 冻结包均保留，不覆盖。

- runner：`scripts/overseas-v019-isolated-runner.js`
- tests：`server/test/overseasV019IsolatedRunner.test.js`
- 历史冻结目录：统一根 `.temp/overseas-v019-isolated-candidate-y201tO/`（保留，不覆盖）
- 当前冻结目录：统一根 `.temp/overseas-v019-isolated-candidate-mdmmhK/`
- 当前 manifest：`.temp/overseas-v019-isolated-candidate-mdmmhK/manifest.json`
- 当前 manifest SHA256：`CDB917A8A9DFD0CAF1278D1CF4C7AAF8449AC62CFA6E85C7943BB501F1EA448F`
- 当前 runner SHA256：`59EA58644C5306030FB372D290F48D74DA87D17B4E407AB65356444032DAAEBF`
- 当前 test SHA256：`63ACE833749A561465757C23D02817B20759CF6F8FA74E85F59D406C5ACFBD58`

候选只接受 `mode=isolated`、注入 transport，明确拒绝 `globalThis.fetch`；没有 DB、provider、AI、写入、共享 Worker 或真实服务入口。冻结 manifest 记录首源 `SRC-A`、board `100017`、languageId `2/9/16`，每站最多 8、全批最多 24、串行、单请求 10 秒、总墙钟 5 分钟、retry=0、redirect=0、fallback=0。token 只作为内存值传递，日志仅保存脱敏路径、状态、provider code 和 HMAC，不保存凭据、正文或原始 post/comment ID。

## 控制器行为与负测

`context` 和 `board` 未成功前不会发 feed；board descriptor 必须来自同站响应，未知 schema 立即停止。任一 redirect、scope drift、provider reject 或 timeout 停止当前运行且不重试；每站 token exchange 只计一次，三站不会串用 session。合成 transport 测试 4/4 通过：24 请求预算与 8/站计数、live fetch/unknown auth 拒绝、redirect 单次停止、挂起请求有界超时且不启动下一站；日志不包含 root secret 或原始 post ID。

P1 修正包括：transport 采用模块私有 WeakSet 品牌，调用方无法伪造；exchange 使用 root token 一次，后续同站请求只复用内存 site token；report 路径统一为模板、ID 只保留 HMAC；请求与 `response.json()` 共享固定 request deadline，调用方参数只能收紧、不能放大；endpoint/path/query 使用逐端点 allowlist，未知键、重复键和额外 comment 路径拒绝。新增 5/5 开发合成测试覆盖这些负例和正例。

开发 QA 原件（非测试负责人签收）：统一根 `.temp/overseas-v019-isolated-qa-4ylHvr/result.json`，SHA256 `D0405CDA990E2C15DB35409FEAC4B942201A8D2CFEE07949AAED706F0C6955BD`；exitCode=0、冻结文件前后 unchanged=true。该历史原件实际 `kind=OFFLINE_SYNTHETIC_QA_EVIDENCE`，guard 字段仍保留旧版声明，仅以文档元数据标识其来源为开发执行，不能替代独立 QA；后续新证据统一 `kind=DEV_TEST_EVIDENCE`。

## 未来真实接线影响

只有在经理另行批准 token exchange 外部状态影响、脱敏落盘策略、真实 endpoint/schema 合同和首源三站授权后，才能将 transport 替换为受控单连接实现。接线必须保持同一 runner 的 allowlist、预算计数、redirect=0、retry=0、context/board barrier 和内存 token 生命周期；不接入共享 Worker、不入库、不调用 AI/翻译/通知。第二源因缺 board、registry 身份不一致继续停止。

该候选的 `ISOLATED_SYNTHETIC_PASS` 只证明控制器边界，不代表真实授权、真实站点可访问、内容采集或生产费用闭包。
