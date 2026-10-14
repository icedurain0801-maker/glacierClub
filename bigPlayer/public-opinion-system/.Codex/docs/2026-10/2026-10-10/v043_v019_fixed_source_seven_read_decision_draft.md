# v019 固定source真实七读具体决定草案

Status: DRAFT / NARROW_DRIVER_QA_PENDING / ACCESS_PROFILE_NOT_VERIFIED / REAL_ACTION_NOT_AUTHORIZED / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

后续收口：窄driver已独立限定PASS；严格profile/私有认证与callback-shaped adapter已隔离实现并开发10/10，新冻结待QA见v044。已有配置来源和真实一次认证读取影响统一见v045，不再要求虚构新provider/新账号。真实mysql2执行、配置材料读取与grant仍未验证，不能以新模拟合同称真实七读已可运行；本草案历史缺口以v045最新收口为准。

## 已落实与办理顺序

固定source、非完整identity的独立窄driver合同及实际fixture命令已实现，新冻结/SQL/schema/限制/开发raw/hash见v042。它取代“只有完整identity fixture”的实现准备缺口，但不包含真实mysql2 adapter或可执行生产命令。生产入口恒拒。先独立QA该合同；再将实际可用读取身份的非秘密摘要与认证材料范围、未来adapter闭包一起补齐，经理据此一次办理固定source七读决定。真实ID只由获准七读产生；不事前要求未知ID，不将fixture ID用于真实范围。

本草案未交为已可执行真实包：QA、实际身份、认证记录及真实adapter尚有待补项。开发负责人负责下一步受控配置接线/adapter隔离验证和证据收口，不以“没有运维”转交一个未定义外部任务；也不在未经授权时通过读取秘密或连接实例自行补证。

## 七读精确范围

source固定081a16d2-5545-4afd-9c65-e04777e4540b；实例固定127.0.0.1:3306/server_id1/public_opinion/MariaDB10.4.14。单专属连接、无pool/重连/retry，R1目标核验在事务外；R2-R7同短RR READ ONLY，成功rollback/end，异常destroy后零操作。

R1实例与DB UTC时刻；R2自身source身份/状态/期限/default_account/schedule/updated_at及config.boardId标量（不读config正文）；R3本站唯一可用account；R4该account唯一active api_token的非秘密元数据与cipher/ref存在布尔（不读正文）；R5本站全部registry ID/siteId/url_hash/状态/检查时刻、最多4且必须恰3/unique；R6源game海外enabled；R7社区归属自身game且enabled。准确SQL/sqlContract/schemaContract只以v042冻结driver为准，不选原config/url/capabilities正文、不查R8或别源secret。stored url_hash不证明URL新鲜度或配置对齐；unknown不升级权限。

七SELECT最大结果行数依次1/2/2/2/4/2/2；每行16KiB、每query32KiB、全批64KiB；query/控制/OPEN每operation最多1s、全过程最多5min。真实连接建立timeout、SQL行/字节流硬限、DateStrings标准化与mysql2销毁兼容需未来adapter隔离验证后冻结；本次JSON fixture字节/计时不能替代真实驱动行为。禁止为了schema探测额外查询而隐增七读预算，额外读须另明确范围。

## 受控配置入口与认证材料范围

已核非秘密现状：项目根.env文件存在（只核路径，未读内容）；`server/src/db/repository.js:229` 支持DATABASE_URL或DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME，默认root/空密码只是源码默认值，**不代表现用身份、权限或适合本次读取**。repository构造器创建共享pool，不复用它；禁止自动取现役Worker账户、扫描.env、解密secret_cipher、借默认root或创建DB账号/ACL。

推荐未来入口为专属只读访问profile的**单条受控记录**，由明确指定的credential provider注入专属driver内存；不是通用路径/env loader。profile非秘密descriptor应固定：profile alias、provider标识与单条record ID、允许的host/port/database/TLS模式、读取identity alias、已有只读授权证明的来源hash/检查时刻、批准manifest hash。driver只接该批准descriptor；认证载荷仅username/password（或已明确单条数据库auth载荷）私有消费，不接受任意连接对象/URI，不输出载荷/hash，不fallback读取环境变量。不得从未确认的DATABASE_URL推导并自动运行。

当前专属profile alias/record ID/用户名alias/grant证明：**待核实，未读取，不能标可用**。现有数据库身份的非秘密摘要必须由批准的单条profile描述记录核实；若已有身份满足范围则绑定该身份，不能“默认root可用”。开发下一单可先实现该descriptor严格验证和夹具配置provider、无秘密回显及目标fence，不实际访问配置store；实际认证材料读取纳入同一真实决定，获准后才取单条记录。如果暂无现成合格profile，不创建账号/ACL、不复制现役密码来绕过，经理决定前需要明确现有记录来源及授权证明。

应请求的认证材料影响是读取这一**数据库访问身份的单条认证记录**，与R4业务api_token元数据不同。第一次真实决定若包含连接必须同时列其确切provider/record ID和认证字段；不能把“业务secret R8未读”表述成“整个运行没有秘密读取”。未指定记录不得读.env全文件、自动扫描配置目录/Windows credential store或打印连接串。profile读取、临时持有、finally清引用由开发实现，不要求用户手工操作真实DB。

## 输出、资源与后续独立决定

首次七读只写脱敏非秘密审批清单到仓库根.temp新唯一目录：真实source/account/credential/registry/site/game/community/board ID、状态/期限/updated_at/stored hash、目标/观察时刻、nonce/plan/manifest与短有效期。不保存credential载荷、config/url正文或密码指纹。Owner开发负责人、QA只读；保留期限由经理在最终决定包明确（当前未决定，不删除旧原件）。logger只固定alias/HMAC及计数，精确ID仅在受控清单供下一决定核范围。该清单不授R8/HTTP/入库/AI。

连接会消耗本机DB连接/查询/共享资源，不能承诺国内绝对零影响；不修改国内/现役、不启第二consumer/服务，不进行外部provider请求或AI，七读阶段无provider exchange费用。现有共享账号/上游配额材料待证，只由批准台账/provider合同补，不主动访问国内/别源secret或试发HTTP。后续R8/envelope（可能含refresh）、内部cipher fingerprint、真实三站24请求及配额/token影响另作具体决定；生产目录/readiness/排他/回退及抓取入库AI没有新增证据。

## 收口检查（不冒充已满足）

| 材料 | 当前状态 | 开发下一动作 |
|---|---|---|
| 窄七SQL/schema/超时/停止合同 | 开发10/10，新冻结v042 | 独立QA及缺陷另冻结 |
| 不读原正文、固定source派生ID | 已fixture验证 | 真实adapter复用合同并做标准化/bytes验证 |
| 专属profile非秘密摘要与record范围 | 待核实；未读秘密 | 实现严格单条provider输入合同，最终包绑定实际记录 |
| 现成读取身份与授权证明 | 未证，不声称可用 | 获准后受控核实指定身份，不扫描/加ACL |
| 真实mysql2 adapter/连接timeout/取消 | 未实施/未证，生产入口关闭 | 新专属隔离adapter合同提测，不用共享pool |
| 真实执行命令、唯一许可manifest | 当前不存在 | 待上述闭包齐、经理办理真实决定后才激活，不提供假命令 |
| 共享配额/资料 | 待证；不影响本次fixture实施 | 台账/合同资料缺口保留，不主动访问国内 |

## 变更记录

本次仅窄隔离driver及决定草案，未读取配置secret或连接DB。尚不能办理真实执行，须QA与实际profile/adapter精确闭包齐后提交最终决定包；不重复普通技术方案审批，真实高影响范围仍单独办理。
