# v019 非秘密metadata探查影响与真实交付差距

Status: FIXTURE_METADATA_IMPLEMENTED / REAL_METADATA_DRIVER_NOT_IMPLEMENTED / REAL_ACTION_NOT_AUTHORIZED / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

## 后续实现更新

固定source、独立窄SQL/rows可控driver已新增实现并开发10/10，新冻结与精确命令见v042，真实七读影响/受控配置与身份材料草案见v043；无需完整identity。下文“窄driver不存在”为当时现状，现fixture合同已补，真实连接adapter和实际可用读取profile仍未实现/核实。没有真实配置/SQL/secret读取或生产开放，不能将窄fixture driver描述为真实七读可运行。

## 已可执行实现与边界

新私有core的 `runFixtureMetadataProbe` 已可执行，data-only完整合成身份/accountRows输入，内部只R1-R7七SELECT、短RR READ ONLY/rollback、不要求cipher/envelope/token输入、不执行R8/V1/transport；生成非秘密fixture source/account/credential/registry精确ID和hash/授权状态清单，不能作为真实秘密授权。metadata5/5原件及精确命令见v040 ctJ4Mg。多账号不猜、冲突/漂移/超时HOLD；production metadata恒拒。

**真实metadata专属driver尚未实现，当前不存在可执行真实命令。** 现fixture仍由完整合成identity生成返回行，不证明真实ID发现；真实首次探查不能复用要求完整identity的fixture接口。这里明确执行合同、读取影响与剩余实现，供经理先办理范围决定后派下一专属driver小单，不把HOLD当实现完成。

## 推荐首次真实探查合同（设计，未执行）

输入只固定实例/source和明确批准的执行manifest，不要求未知真实account/credential/site ID。固定本机127.0.0.1:3306、server_id1、database public_opinion、MariaDB10.4.14；专属单连接无pool/重连/默认fallback。先R1拒错实例，再同短RR READ ONLY内R2-R7，成功/未销毁失败ROLLBACK；query超时/取消失败destroy后不query/rollback，禁止重试。1s/query、最多七SELECT、全探查≤5min；实际mysql2超时/锁等待/销毁兼容必须专属driver隔离证明，不沿fixture trace声明已证。

首次真实探查应采用下表窄合同，**不是现fixture SQL可原样切生产**。特别是旧R2完整config、R5完整url/capabilities可能夹带遗留秘密，不能未经证明把它们归为“非秘密读取”。第一阶段只读标识、状态、已存hash和明确boardId字段；raw config/URL等潜在秘密读取与公开投影生成须后续另明确边界。

| 查询 | 参数来源 | 首阶段精确字段及条件 |
|---|---|---|
| R1 | 无 | @@port, @@server_id, VERSION(), DATABASE(), UTC_TIMESTAMP(3)；不读CURRENT_USER/env/连接串 |
| R2 | 固定source `081a16d2-5545-4afd-9c65-e04777e4540b` | id/game_id/community_id/platform/enabled/auth_status/auth_expire_at/default_account_id/schedule_version/updated_at；仅JSON_UNQUOTE(JSON_EXTRACT(config,'$.boardId')) AS board_id，不SELECT整个config |
| R3 | 同固定source | id/source_id/game_id/community_id/platform/enabled/auth_status/auth_expire_at/updated_at；ORDER BY id，最多返回2候选用于识别多账号，不按default_account猜选 |
| R4 | R3唯一有效自身account ID | id/source_id/account_id/credential_type/status/expire_at/last_checked_at/updated_at、has_cipher/has_ref布尔；type固定api_token，不返回cipher/ref正文；最多2有效候选识别冲突 |
| R5 | 固定source | id/source_id/site_id/url_hash/enabled/auth_status/last_checked_at/updated_at；读本站registry完整集合并要求恰三条，不读取url/capabilities正文；最多4用于发现额外站点 |
| R6 | R2.game_id | id/region_code/enabled，最多2，必须唯一overseas/enabled |
| R7 | R2.community_id | id/game_id/status，最多2，必须唯一且自身game/enabled |

所有参数由固定source或前置短事务返回精确值产生，禁止SQL字符串拼接/跨source查询。R3多可用账号、R4多active/过期冲突、缺字段/额外registry或board不匹配即HOLD；不访问别源secret补证。行数/字节也需专属driver硬限与schema类型验证；限制值在实现冻结时与测试一起明确，不能靠LIMIT掩盖候选冲突。当前合成版本整数不当真实数据库version。

输出到受控根.temp非秘密执行清单：真实source/account/credential/registry/site ID、game/community/board、状态/期限/updated_at/hash、实例及DB时刻、manifest/plan hash/nonce/短期限。面向用户的日志使用alias/HMAC，不输出raw config/url/token/秘密hash；精确ID只在经理批准清单供核下一阶段范围。保留owner为开发负责人、QA只读；保留期限待经理明确，不擅自删除旧证据。此清单不授R8或HTTP。

## 经理办理决定时的精确影响

第一次只批准固定实例/source的七SELECT及专属连接读取身份/凭据元数据，不能要求事前已有未知ID。连接认证配置读取本身涉及数据库访问秘密：未来driver必须使用明确指定的专属读取配置/受控注入路径，不能扫描全.env、打印连接串、自动借用现役Worker身份或加ACL。若无现成合规读取身份，由经理提供，不能在本单创建账号/DDL/ACL。短读会占用本机DB连接及共享资源，不宣称对国内绝对零影响；无外部provider请求、无账号exchange/刷新、无AI费用、无业务写。

第二次用第一次精确ID清单决定R8单次cipher/envelope读取、可能包含refresh材料、内存解密与同ID密文fingerprint检测、raw config/URL读取是否涉及遗留token及脱敏策略。第三次再决定三站3exchange/9+15有限24请求及32SELECT、provider费用/共享额度和真实transport闭包。不能将一次“非秘密metadata”决定包扩大为secret/HTTP/入库/AI；批准后实现冻结及独立QA仍需完成。

未来真实driver隔离实现需要：独立metadata参数/schema入口、不依赖已有完整identity；可信固定实例连接工厂、超时destroy合同；R2窄JSON字段及R5不读url/capabilities；精确七SQL/行数/字节/类型；受控清单保存与秘密拒输出；无query/callback/live绕过。上述驱动不存在，拟真实CLI名称/参数需下一单实现后才能提供实际执行命令，不能现在运行通用--isolated或旧宽reader。

## 共享配额与真实目标证据缺口

| 缺口 | 需要来源/下一交付 | 当前情况 |
|---|---|---|
| 本source账号/token是否与国内或第二source共享 | 经理/运营批准账号台账与归属证明；不得比较别源cipher/token | 待资料，不能主动探国内补证 |
| provider额度/费用及exchange是否影响现有session | provider合同/运营配额证明；不靠试发HTTP/429推测 | 无可信材料；真实HTTP不授权 |
| DB连接身份、schema/type及取消销毁 | 指定专属读取身份非秘密配置摘要、固定版本driver隔离证据 | 当前仅合成SQL；真实driver未实现 |
| raw config/url可能夹带秘密 | 安全字段来源与批准的窄投影方案 | 首阶段排除正文；不能称读取过完整config仍绝对非秘密 |
| 真实三站抓取/页内容+任务账本+cursor事务 | 精确真实scope/transport及持久事务独立证据 | 本次fixture不增加真实证据 |
| 入库后AI/翻译及通知 | 精确allowlist、费用上限与独立消费者证据/决定 | 无新增真实AI结果，不用pending冒完成 |
| 生产持久目录/排空恢复/排他/readiness/回退 | 经理排期对应运行边界及独立QA证据 | 仍未交付；不启动服务、第二consumer或恢复proof |

## 变更记录

本次补专属fixture metadata入口与五组验证，并收口真实七读影响及实际尚缺driver/资料，未执行真实连接、metadata、secret/HTTP/AI或生产/国内操作。结合v040新fixture集成提测，不以任何限定PASS替代真实目标。
