# v019 私有fixture集成变更记录

Status: IMPLEMENTED / DEV_TEST_EVIDENCE / QA_PENDING / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

新增同一私有核心 `scripts/overseas-v019-fixture-integration-contract.js`，原observation/reader文件改为兼容wrapper，仅转发原公开API，不暴露内部WeakMap/resolver/driver/transport/callback/预算覆写。`issueFixtureIntegration` / `runFixtureIntegration`只接data-only合成输入与单次opaque批次能力。内部R8私有apiToken在exchange精确descriptor与transport校验中实际消费；每槽强制V1成功ROLLBACK后才transport。unknown保留原reader registry观察，临时proof只用于同批取样能力；认证9+取样15共24请求、3exchange、32SELECT，auth-only9/17。

唯一deadline在R1前建立并包含读取、认证、转换、取样；query/request上限仅可收紧，跨阶段8MiB累计/单响应1MiB保持。失败销毁合成连接、后续0、无rollback/query/reconnect；成功失败均清私有secret/session/proof及所有观察句柄引用。JS内存及调用方输入不承诺物理擦除。报告区分attemptedSlot/transportCount，V1当前失败不能被误写为当前transport已发。

新增 `server/test/overseasV019ObservationIntegration.test.js`，覆盖正常/unknown与事件顺序、24槽逐一V1失败当前transport0、R1-R8失败0、registry/config/account/cipher/count漂移、秘密request错值、自然到期、R1前总deadline/转换不续期、实际字节恰等/+1、认证失败/请求body超时、opaque跨批复制/重用/未知绕过键/getter/生产关闭。四个受影响wrapper阶段在新版本分别回归，旧包未重跑充证。

经理06:30补充单收口metadata：新增 `runFixtureMetadataProbe`，独立仅R1-R7七SELECT，不接受cipher/token/refresh输入，不调用R8或transport；从合成返回行生成非秘密ID/registry状态清单，拒冲突、多账号、漂移与超时。新增Metadata.test五组及精确metadata freeze阶段。这里是已给完整合成身份的fixture结果合同，不证明真实ID发现。真实metadata入口恒抛REAL_METADATA_PROBE_DISABLED，实际驱动/身份探查实现与决定缺口另在交接包明确，不能称真实探查已可运行。

依赖独立QA当日v035已正式签Kxx61Q及fnClEp限定PASS，无待修阻断；本次核心重排与新入口不沿旧hash签收。首版integration k33HGB保留，开发ByCNfw/result.json SHA `57520b47669e4b3f10c01bde85646d38b9dacd41d560c411e9bd473c6aa49ffa`为8/10失败：registry负测本来值相同、转换deadline场景太短；仅修为实际漂移及足够认证时限。中间sUjzgg开发ow11sL SHA `af5483cffd3c4795c56917f532d1c53a0d7228184794d53c656334e16f00ba35`10/10通过，但随后增加metadata与全句柄清理，须最终新冻结，不复用中间PASS。

员工仅只读设计/复审，负责人唯一落补丁；未改业务connector/shared/国内或经理待办，未生产SQL/secret/HTTP/AI/DDL/ACL/服务/账号刷新/registry写/push/发版。全部新开发与QA只可限定fixture集成，真实目标依然HOLD。最终manifest与原件/hash另记录v040。
