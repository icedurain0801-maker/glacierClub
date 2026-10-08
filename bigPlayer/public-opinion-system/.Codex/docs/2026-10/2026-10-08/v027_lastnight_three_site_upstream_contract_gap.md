# Last Night 三站上游请求身份缺口

Status: evidence-required-production-no-go
Date: 2026-10-08

## 已确认事实

- 2026-09-18 `v215_siteurls_multi_community_browser_regression_matrix.md` 记录 Last Night 当时仅有一条 `club-en.q1.com` 站点 URL；其中 `languageId=2/9/16` 的三站案例属于 X-Clash，不能移作 Last Night 身份合同。
- 当天 `v004_sync_migration_window.md` 只确认 Last Night 当前 source config 有三个启用站点、registry 只有一条 legacy 站点；它没有证明三个 URL 的上游数据域互异。
- 2026-09-10 `v068_p0_last_night_controlled_collection.md` 记录一次单 source 采集，不构成三站分流证据。
- `BigPlayerH5Connector` 对绝对 `/api/...` 路径构造请求；站点 URL 上的 `site` 等查询参数没有自动继承。语言头差异本身不能证明上游返回不同内容集合。
- 2026-10-08 产品经理转交的同快照只读核查确认：当前批准配置中 Last Night 三个启用 site 的 URL 仅 `languageId=2/9/16` 不同。此事实属于当前配置，不把 2026-09-18 X-Clash 的三站历史案例当作 Last Night 证据。现有 `q1Context` 不读取 `languageId`；`requestQ1` 的绝对 `/api/...` 请求不继承该页面查询参数。在其余请求条件相同的当前配置下，三站 context 请求签名碰撞；尚无上游合同或脱敏响应 ID 证据证明数据域独立。

## 当前代码门禁

真实 Connector 三站请求签名相同则在 Store/HTTP I/O 前报 `LAST_NIGHT_UPSTREAM_SITE_COLLISION`；即使只有语言不同，也报 `LAST_NIGHT_UPSTREAM_SITE_IDENTITY_UNVERIFIED`。执行器先准入、后 `freezeSites`；未显式登记的普通对象包装报 `LAST_NIGHT_FIXTURE_CONNECTOR_REQUIRED`。隔离夹具可测试持久化，但不能替代真实上游身份合同。生产执行维持 `NO_GO`。

隔离回归使用仅 `languageId=2/9/16` 不同的代表性 URL，断言碰撞时 HTTP 请求和 Store 写入均为零。不得通过猜测将 `languageId` 注入 API 请求来解除门禁。

## 待外部提供的脱敏证据

1. 同一批准配置快照内 Last Night 三条站点 URL、`siteId` 与 source/account 绑定关系；敏感查询值可脱敏，但应保留可判定差异的字段名和等价性。
2. 上游/接口负责人确认的真实区分字段与合同版本，以及每站实际请求的 method、origin、path、query 键及非敏感请求头签名；不得仅以网页 URL、`lang` 或 `languageId` 推断。
3. 经授权、脱敏的响应证据：板块身份、内容 ID 集合或等效稳定标识，以及三站独立性的判定方法；同时说明重复内容的预期处理。
4. 上述证据对应的上游接口合同版本、采样时间与批准人。取得证据后先更新 Connector 接线和隔离测试，再申请独立 QA；本文件不授权真实 API、AI 或生产数据库访问。
