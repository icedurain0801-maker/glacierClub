# D1/D2/D7 生产配置有界只读核查

Status: READONLY_EVIDENCE / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

## 范围与安全边界

本轮只使用本机 `.env` 中固定的回环 3306 目标连接，单连接执行 `START TRANSACTION READ ONLY`，仅查询 `information_schema`、配置表、AI/翻译预算表和只读环境变量，最后执行 `ROLLBACK` 并关闭连接。

未执行 HTTP、token exchange、账号刷新、AI/provider 调用、SQL 写入、DDL、ACL、服务操作或第二 consumer；未保存原始配置 JSON、credential secret、token、密码、连接串或 provider 响应。现有 `lastnight-production-reader-audit.js` 和 `snapshot-production-dba-preflight.js` 因会创建/rename 审计文件，不作为本轮入口。

观测时间：2026-10-10 04:34:03 与 04:34:47（Asia/Shanghai）。数据库身份摘要：本机回环目标、port `3306`、server_id `1`、版本 `10.4.14-MariaDB`、业务 schema；连接主体仅保留 SHA-256 摘要 `0a44f8735cbc275f1efcdf43159dcd20e54a1c994d0daeb92d04c389078057b5`。

## D1：source/account 自身绑定

- 海外第一源（稳定别名 `SRC-A`）：enabled、`auth_status=authorized`，game 为海外、community `COMM-A`，默认账号 `ACC-A`；账号 enabled 且 authorized。对应 `api_token` credential 为 active，只有“存在/状态/检查时间”被记录，未读取 secret 内容。
- 海外第二源（稳定别名 `SRC-B`）：enabled、`auth_status=authorized`，game 为海外、community `COMM-B`，默认账号 `ACC-B`；账号 enabled 且 authorized。credential 同样仅确认 active 和密文存在，`last_checked_at` 为空。
- 两个 source 的 source/account/game/community/platform 绑定自身一致；这只证明静态配置关系，不证明 token 可交换、站点可访问或真实内容分流。

## D2：站点、URL、registry、board

- `SRC-A` 配置含 `boardId=100017`，三条 URL 均为 `https://club-en.q1.com/`，参数为 `env=web`、`gameId=2177`、`gameVersion=2177-US-ZS`、`lang=en-US`，`languageId` 分别为 `2/9/16`。URL hash 与存储 `po_source_sites.url_hash` 一致。
- `SRC-A` registry 有三条 enabled 记录：languageId 2 对应的 legacy 记录为 `auth_status=authorized`；languageId 9、16 对应记录为 `auth_status=unknown`，未确认 board/授权合同。
- `SRC-B` 配置有三条 URL，参数为 `gameId=2162`、`gameVersion=2162-US-ZS`、`lang=ja-jp`、`languageId=2/9/16`，但配置缺少 `boardId`。registry 只有一条 enabled 的 legacy 记录，另外两条配置 URL 没有对应 registry 记录；该源存在 registry 数量和身份不一致。
- `SRC-B` 不能借用 `SRC-A` 的 `boardId=100017`、registry 或 credential；两个源的真实站点分流、board 可访问性、feed schema 和响应合同仍待独立授权后的 HTTP 侦察。

## D7：预算、provider/model/version

- 本机环境静态值：分析 enabled，light model/version 为 `gpt-4.1-mini / sentiment-v1`，light 日限额 `1000`；deep model/version 为 `gpt-5.6-luna / sentiment-v1`，deep 日限额 `200`；翻译 enabled，model/version 为 `gpt-4.1-mini / translation-v1`，日限额 `5000`。
- 数据库翻译日预算表最近记录显示历史日期有 `5000` 次计数；未发现可将该计数解释为本窗口海外 scope cap、金额上限、UTC billing day 规则或失败/重试计费闭包的字段。
- AI usage 表本轮无可计入的行；因此不能把环境变量限额、历史翻译计数或 fixture cap 当成生产海外费用证据，也不能证明 provider 真实合同。

## 结论与流转

本轮只读证据可计入 D1 的静态自身绑定和部分 D2 配置事实；D2 仍因 `SRC-A` 两站 auth unknown、`SRC-B` 缺 board 且 registry 不一致而 `NO_GO`。D7 仅完成静态配置盘点，生产 scope cap、金额、重试计费、真实 provider 合同仍为待确认。状态保持 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`；不允许据此开放真实 HTTP、AI/翻译、生产迁移或共享 Worker 切换。

开发侧历史 stdout 未作为原件保存，不能据此宣称独立 PASS。旧原件已从业务目录 `.temp` 可恢复迁移至统一根 `.temp/overseas-d1-d2-d7-legacy-6ZCGUP/result.json`，未删除。按经理授权重新采集的脱敏原件位于统一根 `.temp/overseas-d1-d2-d7-OXr23Q/result.json`，SHA-256：`59874B07E6852BDAB427DD021B7024D19C90A050CE14DE296D8FBF535829C8B5`。原件记录实际 SQL 白名单、目标身份校验、事务 `START TRANSACTION READ ONLY`、`ROLLBACK`、连接关闭和 D1/D2/D7 脱敏结果；能力详情采用显式字段白名单，`samplePostId` 等标识只保留 HMAC；不含 token、密码、secret_cipher、连接串或 provider 原始响应。正式 QA 可在同一固定目标和同一白名单下独立短 SELECT 复核，不得扩大范围。
