# v019 固定source七读与已有配置认证影响收口包

Status: SCOPE_REVIEW_READY / PROFILE_ADAPTER_QA_PENDING / REAL_EXECUTOR_NOT_ACTIVE / REAL_ACTION_NOT_AUTHORIZED / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

2026-10-10纠正（历史原文保留）：v046已确认项目根node_modules/mysql2及现有release有3.23.2、lock/hash一致；此前“本项目未安装”的整体判断不准确。最新实际驱动工件、精确冻结与受控读取影响见v046/v047；其独立QA仍待回，真实入口继续关闭，不把旧fixture或新协议测试当真实运行许可。

## 现有证据与实际边界

固定source独立窄七读合同T5dkfA已独立签ISOLATED_NARROW_METADATA_CONTRACT_PASS，见当日测试v036。现新增严格已有配置descriptor与私有认证/adapter合同，最终2iawkB开发10/10及四文件冻结/hash见v044，待独立QA。目标、SQL、候选唯一性、结果schema/类型/日期/字节、callback竞争/超时destroy后零操作已具可复现隔离合同；均不等真实数据库结果/配置或grant。

本包供项目经理评审**真实首次七读的范围与影响**，尚非可执行生产放行包。当前mysql2声明^3.11.0、本项目未安装，实际mysql2版本/field packet/连接行为尚未验证；真实入口恒拒，也没有可运行的真实七读命令。不能批准一个fixture命令冒充真实执行。后续需把实际批准的驱动工件版本、配置读取边界和连接执行实现另冻结核验，作为实际运行前检查，不能以grant未证编造已可用，也不能要求新建账号/ACL作为必备。

## 首次范围（不事前要求未知ID）

只固定source081a16d2-5545-4afd-9c65-e04777e4540b及本机127.0.0.1:3306/server_id1/public_opinion/MariaDB10.4.14。真实account/credential/registry/site ID由获准窄读生成；不得引用fixture-discovered ID。专属单连接，无shared/现役pool、无默认root/空密码回落、无URI/env自动选择、retry/reconnect0。

七SELECT准确合同以v042/v044 sqlContract为准：R1实例/UTC时钟；R2本source身份/状态/期限/default_account/schedule/updated_at及config.boardId标量；R3唯一可用自身账号；R4该账号唯一active api_token元数据与cipher/ref存在布尔；R5本站全部registry的ID/siteId/stored url_hash/状态/检查时刻，R6海外enabled游戏、R7归属同game的enabled社区。R2不读config正文，R5不读url/capabilities正文，R4不读cipher/ref/refresh正文。R1在事务外核目标；R2-R7同短RR READ ONLY，rollback/end。预算最多7SELECT，1/2/2/2/4/2/2行；每行16KiB/query32KiB/batch64KiB；connect/query/控制/end≤1s，整批含认证读取≤5min。实际驱动原始行流和规范化bytes需真实adapter隔离工件证明，不沿用物化模拟数组结论。

任一错实例、schema/type/date/byte、候选冲突/默认账号冲突、source/game/community/registry/hash漂移、过期、连接/query/end异常，停止整批，不发后续SQL、不重连/重试。销毁连接后不rollback/query/end；已成功end但期限变过期仍不发布清单。readonly身份是否足够权限在首次真实读出现拒绝时HOLD，不扩大授权、创建账号或改ACL补救。

## 已有配置来源与一次认证读取的精确影响

允许评审的已有来源路径是 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/bigPlayer/public-opinion-system/.env`。已核仅文件路径存在和repository.js静态支持的DB键，未读内容。描述符绑定该准确路径、一次exact-db-fields-once、五键DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD；manifest/固定目标/source/identityAlias一并绑定，不接受其他record/文件/目录扫描或DATABASE_URL混用。该路径是已有配置来源，不虚构新provider record，不强制新账号或ACL。

**selectedFields是消费/输出合同，不证明物理读取范围。** 若未来配置读取器直接读取现有.env字节再解析五字段，将实际触及整文件字节，里面可能包含其他secret；在没有证明文件只含DB字段之前，不能包装成“只读取数据库认证材料、其他秘密从未读”。因此最终真实决定必须二选一明确实际输入来源：已有可信配置读取组件提供筛选后的单条DB认证记录（证明该组件的既有读取权限与边界），或在决定中明示指定.env整文件的一次受控读取影响及只消费五键/不输出不保存其他字节的策略。当前两者均未发生，不能暗中读文件先补证；不做.env发现扫描或credential store搜索。

现成身份非秘密摘要目前：来源路径如上、identityAlias占位unverified、实际username/授权证明尚未核实。源码root默认不是现用值或授权证据。若获准读取已有身份，执行前输出其非秘密alias/授权资料来源hash，认证username/password只进入私有连接配置，不输出/存盘/hash密码、不借现役pool；缺DB键/不合固定host/database/身份不齐即HOLD，绝不fallback root。grant资料缺失仅记未证，不假称只读权限已验证；无需通过主动访问国内或别源secret补证。

本次隔离代码用私有synthetic认证值验证消费和清理；没有实现.env读取器或真实credential provider，不把descriptor声明等同实际认证读取。下一真实执行闭包需选择并冻结上述已有来源的受控读取实现和实际mysql2工件；开发负责代码/隔离QA及证据，不转嫁为用户手工运维任务。

## 审批清单及清单输出

第一次具体决定包含：固定source/实例；既有配置路径或既有单条筛选记录的准确来源；DB认证材料读取实际范围及identity摘要未证状态；七窄SQL/控制语句/连接时限/行字节；无重试/写/DDL/ACL/服务/HTTP/AI；只写根.temp新唯一非秘密审批清单；真实执行工件manifest及QA报告；保留owner/期限。当前真实工件manifest与保留期限待经理补齐，不能拿v044 fixture SHA作为真实许可。

输出包括真实候选source/account/credential/registry/site/game/community/board ID、状态/期限/updated_at/stored hash、实例观察时刻/nonce/manifest/plan/短有效期。不保存认证值或config/url正文；精确ID仅给受控下一审批清单，日志alias/HMAC/计数。它不授R8/HTTP/proof恢复或生产运行。业务secret R8/envelope可能含refresh、内部cipher fingerprint、真实24请求/三站exchange、入库/AI/通知另决定。

连接/查询占用共享本机资源，不能承诺国内绝对零影响；provider请求和AI在七读阶段均0，不靠试发/429推费用。账号共享与provider配额由批准台账/合同补，当前待证；不访问国内/别源secret。真实三站抓取入库AI、生产持久目录/readiness/排他/回退仍无新增证据，不被限定fixture PASS覆盖。

## 变更记录

本次将已有配置来源、实际身份未证、物理读取范围、adapter模拟限制和真实工件尚缺统一列入可审范围包。v044先交独立QA，签收后只更新其限定范围，不直接开启生产。没有真实连接/配置secret读取/SQL/HTTP/DDL/ACL/服务/国内操作，proof停止，HOLD。
