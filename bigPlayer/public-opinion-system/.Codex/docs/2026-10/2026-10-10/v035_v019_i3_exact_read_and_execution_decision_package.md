# v019 I3 精确短读与未来执行决定包

Status: DESIGN_ONLY / EXACT_IDENTITY_PENDING / REAL_ACTION_NOT_AUTHORIZED / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

## 后续隔离实现更新

R1-R8/V1参数化SQL、合成返回schema/值绑定、短事务/超时销毁与分阶段决定方案已落专属隔离合同，当前交QA候选和证据以v036最终Kxx61Q为准；unknown同批认证9+取样15临时能力转换以v037 fnClEp为准。下面“尚无reader/转换未设计”的文字是当时设计历史，现已补fixture实现；仍没有真实reader/transport及整链集成，真实操作继续未授权。真实决策先R1-R7非秘密探查产生精确ID，再单独决定R8/secret及24请求，不要求metadata探查前已有真实ID，避免审批循环。

## 目标与推荐执行选择

首源固定 `081a16d2-5545-4afd-9c65-e04777e4540b`，board100017，三站club-en.q1.com、languageId2/9/16及其他公开参数沿v027。推荐最终真实目标为最多24次有限取样，9次auth-only仅前置诊断、不算交付。两种真实执行均未授权，I1/I2只签合成fixture；不能从历史投影反推真实account/site/credential ID或升级两站unknown。第二源请求0。

## 固定目标与短读候选合同

未来专属reader固定本机 `127.0.0.1:3306`、`@@server_id=1`、`DATABASE()=public_opinion`、MariaDB10.4.14，单专属连接、不pool、无重连/自动retry。所有查询参数化，仅本source；身份与字段不齐即停止，不输出env/连接串/CURRENT_USER。不运行旧D1-D2-D7宽reader。目标及读取权限需经理统一办理，本文没有连接DB。

| 编号 | 读取字段/精确范围 | 输出/条件 |
|---|---|---|
| R1 | @@port,@@server_id,VERSION(),DATABASE(),UTC_TIMESTAMP(3) | 固定目标和DB时钟；非秘密摘要 |
| R2 | po_sources WHERE id=固定SRC-A：id,game_id,community_id,platform,enabled,auth_status,default_account_id,schedule_version,config | board与v2公开URL投影；不输出secret/未知query；默认账号仅候选ID，不构成授权 |
| R3 | po_accounts WHERE source_id=SRC-A：id,source_id,game_id,community_id,platform,enabled,auth_status,auth_expire_at | 必须唯一指定可用自身账号；多候选不猜、不轮询尝试。最终账号ID在受控执行清单明确列出 |
| R4 | po_credentials WHERE source_id=SRC-A AND account_id=R3唯一账号 AND credential_type='api_token'：id,source_id,account_id,credential_type,status,expire_at,last_checked_at、hasCipher/hasRef布尔 | 唯一active/未过期；不读cipher/ref正文。缺id/冲突或版本无法证明则HOLD |
| R5 | po_source_sites WHERE source_id=SRC-A：site_id,url,url_hash,enabled,auth_status,capabilities,last_checked_at | 三站精确配置/registry匹配，未知授权不能自动改状态 |
| R6 | po_games WHERE id=R2.game_id：id,region_code,enabled | 必须overseas/enabled |
| R7 | po_communities WHERE id=R2.community_id：id,game_id,status | 必须自身game且enabled |
| R8 | R4精确credentialId+source/account/type/status的secret_cipher、expire_at | **新增秘密读取**，只能另获决定后执行一次；不SELECT密码类型/secret_ref/refresh字段，不返回解密对象到caller/log |
| V1 | 每次HTTP前一条绑定join/固定参数读R2-R7对应精确身份、config/schedule/hash/状态/期限及@@port/server_id/DB时钟 | 单独短READ ONLY/rollback；漂移拒绝。具体SQL和实际字段schema须隔离实现后冻结，不执行拼接占位SQL |

R1-R7七条在同短RR READ ONLY事务取一致非秘密快照后ROLLBACK；批准秘密读取R8一次另短READ ONLY后ROLLBACK。HTTP前V1至多24次（auth-only至多9次）；最大SELECT为32（auth-only17），不含事务控制语句。复用同一专属连接且每次V1核目标；断连接停止，禁止重连增加查询。全批5min含读取/解密/请求/落脱敏元数据；DB语句短超时建议1s、lock wait1s，具体驱动取消/目标兼容须隔离证明，不预写真实timeout已验。

这是一份字段/次数合同，尚无真实reader。当前新代码仅fixture整数版本；生产源/账号/凭据/registry没有等价独立版本合同。生产绑定应以实际字段canonical哈希+不可变credential ID/状态/期限+密文版本指纹（仅内部，不输出）绑定，不编造版本字段。确认是否允许对密文计算内部指纹属于R8影响决定的一部分。若目前无可信更改版本或无法检测同ID密文替换，不能宣称执行期间版本fence闭合；另设计并隔离验证，绝不加生产DDL掩盖。

## 身份清单生成与校验

reader产生受控内部执行清单：实际source/account/credential/site精确ID，公开game/community/board/URL投影，R1时刻、v2投影hash、metadata/内部secret版本摘要、manifest/plan SHA、批次nonce与截止。身份原值仅内部批准清单，不在对外日志；给经理的非秘密审批清单列账号/凭据/site精确ID供核范围（ID本身不等秘密），不得含token/cipher/ref正文。当前没有获准读新R3-R8，实际账号/凭据/siteID仍待生成，不猜。

caller不得上传真实token绕签发器，不接受其他source的account；凭据解密只传本站内存token能力，禁止fallback/刷新、password/browser login；envelope即使含refresh材料也不交runtime或输出。单站最多一次exchange，token影响未知停止且不撤销/重放。生产Signer仍恒拒，待真实签发来源和transport另冻结独立QA后才能考虑开专属许可入口，不给合成runner加live开关。

## 配额与国内影响证据来源

| 证据 | 非秘密来源 | 当前能否获得/结论 |
|---|---|---|
| scope与账号共享 | 自身source-account-credential关联可短读；跨国内账号/同token共享只能由批准的账号台账/服务负责人资料确认 | 不访问国内来补证；不得hash/比较别源secret，真实共享情况待资料/后续精确决定 |
| 上游请求额度/token exchange影响 | provider接口文档/账号运营配额证明，或经批准的响应非秘密limit字段 | 未有可信合同；不靠试发/429测额度，不声明免费或不影响国内 |
| 国内零主动变更 | 专属模块依赖闭包、guard拒DB写/shared入口/服务与无端口、冻结清单 | 隔离可验主动行为；不足以证明共享机器/上游配额绝对零影响 |
| Node/代理/DNS/连接取消 | 指定Node版本+内置HTTPS依赖/代理配置非秘密摘要、受控stream/abort隔离测试 | 未做真实DNS/TLS/代理探针，不修改hosts/env；真实transport关闭 |

执行前须运营/经理确认账号和配额不会扰动国内；若资料不足保持HOLD，不通过访问国内Worker、第二consumer或服务重启绕过。两个生产持久目录仍未形成交付证据；有限侦察只允许脱敏.temp证据，绝不当生产持久恢复。

## 一次可决定的影响清单

经理办理真实决定前将以下合并为一个具体包：实际账号/credential/site精确ID；R1-R8/V1准确实现SQL/次数/timeout与固定目标；一次secret内存解密及其指纹边界；三站token最多3次的外部影响；24取样推荐与9诊断备选、每请求10s/整批5min/1MiB与8MiB、retry/redirect/reauth/fallback0；额度来源/国内共享确认；随机HMAC脱敏原件及保留owner/期限；任一异常整批停止/未知token影响不重放；abort/取消/清引用而非远端撤销；新freeze独立QA限定合同。任何一项仍待确认，不能称包可执行。

统一旧计划异常策略：今后候选默认任一HTTP/token/schema/scope/身份/预算/timeout异常停止**整批**，未用站点额度不再发；旧v019/v027原稿历史保留，原“停止该站”不作为新执行口径。unknown诊断成功不更新registry，不借合成PASS放feeds；24模式的真实unknown成功后能力转换合同必须新设计/QA，现fixture sample严格拒unknown。三站仍同origin，有限样本不证明真实分流。

## 后续尚缺的真实交付

侦察不是入库：run/epoch任务账本、页内容/jobs/cursor持久事务、共享唯一消费者、readiness/生产schema、持久状态目录/排空恢复、旧版回退、异步分析翻译精确allowlist与金额预算/通知门禁、真实下一槽完整执行都仍需各自实现/独立证据和具体决定。pending job不等AI完成，v014真实时间+合成传输不等真实抓取。此包不授入库、AI、生产DDL/ACL/切换/发版。

## 变更记录

只新增可审读取/影响决定包；没有新SQL/secret/HTTP/账号刷新/服务操作。准确实际ID和reader/transport生产来源未取得，不把待确认写成事实。I1/I2隔离交接见v034，四组外围签收另单，不替代首源目标。
