# Last Night 三站上游请求身份缺口

Status: evidence-required-production-no-go
Date: 2026-10-08

## 已确认事实

- 2026-09-18 `v215_siteurls_multi_community_browser_regression_matrix.md` 记录 Last Night 当时仅有一条 `club-en.q1.com` 站点 URL；其中 `languageId=2/9/16` 的三站案例属于 X-Clash，不能移作 Last Night 身份合同。
- 当天 `v004_sync_migration_window.md` 只确认 Last Night 当前 source config 有三个启用站点、registry 只有一条 legacy 站点；它没有证明三个 URL 的上游数据域互异。
- 2026-09-10 `v068_p0_last_night_controlled_collection.md` 记录一次单 source 采集，不构成三站分流证据。
- `BigPlayerH5Connector` 对绝对 `/api/...` 路径构造请求；站点 URL 上的 `site` 等查询参数没有自动继承。语言头差异本身不能证明上游返回不同内容集合。

## 当前代码门禁

真实 Connector 三站请求签名相同则在 Store/HTTP I/O 前报 `LAST_NIGHT_UPSTREAM_SITE_COLLISION`；即使只有语言不同，也报 `LAST_NIGHT_UPSTREAM_SITE_IDENTITY_UNVERIFIED`。执行器先准入、后 `freezeSites`；未显式登记的普通对象包装报 `LAST_NIGHT_FIXTURE_CONNECTOR_REQUIRED`。隔离夹具可测试持久化，但不能替代真实上游身份合同。生产执行维持 `NO_GO`。

## 待外部提供的脱敏证据

1. 同一批准配置快照内 Last Night 三条站点 URL、`siteId` 与 source/account 绑定关系；敏感查询值可脱敏，但应保留可判定差异的字段名和等价性。
2. 每站实际请求的 method、origin、path、query 键及非敏感请求头签名，并说明哪一项由上游明确用于区分数据域；不得仅以网页 URL 或 `lang` 推断。
3. 经授权、脱敏的响应证据：板块身份、内容 ID 集合或等效稳定标识，以及三站独立性的判定方法；同时说明重复内容的预期处理。
4. 上述证据对应的上游接口合同版本、采样时间与批准人。取得证据后先更新 Connector 接线和隔离测试，再申请独立 QA；本文件不授权真实 API、AI 或生产数据库访问。
