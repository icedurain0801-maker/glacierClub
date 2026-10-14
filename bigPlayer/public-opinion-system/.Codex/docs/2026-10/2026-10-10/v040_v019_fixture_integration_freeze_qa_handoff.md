# v019 fixture集成与新版本回归冻结交接

Status: DEV_TEST_EVIDENCE / QA_PENDING / REAL_INTEGRATION_NOT_TESTED / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

## 当前唯一交接批次

集成已落实v038批准范围，变更逻辑与首轮失败历史见v039。依赖独立报告 .tests/2026-10/2026-10-10/v035_v019_reader_conversion_independent_qa.md 已核，Kxx61Q/fnClEp仅原版本限定PASS，不覆盖本批。最终私有core SHA256为4542520c4ba4aff96053b159ca6e5b7137db9a4d14de008ed3f4123d51e6224a；六包均该core、同wrapper与runner版本。开发集成10/10、metadata5/5，四受影响阶段分别reader10/10、conversion8/8、identity6/6、stream8/8。各阶段冻结前后bytes/hash一致，stderr空、exit0、passed/unchanged=true；全部原件实际kind DEV_TEST_EVIDENCE，不代独立QA。

全部冻结和开发原件相对仓库根 C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp，表中每包以自身manifest独立验证：

| 阶段 | 唯一冻结目录 | manifest SHA256 | 开发测试 | 开发原件 | 原件 SHA256 |
|---|---|---|---|---|---|
| integration | v019-contract-integration-GTdpoY | 9462e5d42340b8d45fb98407b3887e6bb0c85a586d39f3993f6bada2e857adb5 | 10/10 | v019-contract-dev-HawPg5/result.json | 03a960113bd237bebf364c4958d8c54b65709c57904aa9bdcabfa9952056fbe4 |
| reader | v019-contract-reader-9yLpYs | 569cc2671e6435324b7c2ce895be1f9fb6cac9402bb4b39ce177ae2554783823 | 10/10 | v019-contract-dev-1LCln3/result.json | 543c2d7e0f407f4ea443f27b9ad06282226cc92cd1c5e57773e2135acd29eb81 |
| conversion | v019-contract-conversion-boinTL | bc17eaed6f05ecc93824028727f17deab2ae4f094318f8c596379e35ed56aabb | 8/8 | v019-contract-dev-kET8ir/result.json | 00478f6464d619076d27c1615e2b8093a7e7c0dfaf56beda5afe7a28c30409d0 |
| identity | v019-contract-identity-fnfW28 | 88e747338b973c741d4e1c3270f7db0b13b15ce4420ef17da2660e26b82db38f | 6/6 | v019-contract-dev-Y7Y1VE/result.json | d98e20c115bda5c27de2ba66a145b57083ff666f2cf64ddf75a0eb04e4074fb4 |
| stream | v019-contract-stream-bxRNED | c04e14873b3653c9a806086db47496a3429bf42833209e726ed6ffe487228673 | 8/8 | v019-contract-dev-AtXDwZ/result.json | d805165962171a6131589933d1d1eeddc785772bd6d91db3206fc83c8b3b730e |
| metadata | v019-contract-metadata-ctJ4Mg | 956c9e73aad1664d0846fdabe5296f703b678d8c8618f8ac000863133b9b53b9 | 5/5 | v019-contract-dev-ZHdMDg/result.json | f1783ecbf6d4605de6272a223c268122f549027184dc06d7d51f8a7a4e28e750 |

当前固定7/7/6/6/6/6文件加manifest（表顺序）；集成与reader包额外含reader wrapper。guard未改；无业务connector/shared/国内依赖。新增core仅node:crypto/node:perf_hooks及内置ReadableStream，无mysql/env/fetch/HTTP导入。源码语法检查通过。新metadata输出精确fixture ID只在独立非秘密发现清单，集成report不含原身份。

## 精确独立QA命令

各自冻结目录为cwd，使用表中本阶段manifest SHA256，不能互换或填旧包SHA：

```text
node scripts/v019-observation-contract-freeze.js --verify <该阶段表内SHA256>
node scripts/v019-observation-contract-freeze.js --test <同一SHA256>
node scripts/v019-observation-contract-freeze.js --verify <同一SHA256>
```

runner已实际支持integration与metadata阶段，固定文件集合/测试文件/断言数；白名单OS env、offline guard、60s编排timeout，内部fresh Node仅测试runner不等业务fresh-process进展。禁止通用--isolated/live/生产入口。旧k33HGB失败及sUjzgg中间PASS/四中间wrapper包都保留，只验本表新闭包，不重跑旧包充证。

## 独立重点

集成入口必须按每槽V1→成功rollback→实际descriptor/token消费→transport运行，不只核计数。24槽逐一V1失败时当前transport0、总transport=n-1，R8失败0；原registry与临时proof分离、unknown9+15/24/32与单nonce/deadline/bytes；R1前读取时间算入总预算；自然到期、同IDcipher与字段漂移、timeout destroy后无query/rollback/reconnect；秘密/能力跨批复制、外部resolver/callback/预算覆写/跳V1/生产全部拒；成功失败清模块私有引用及脱敏。旧wrapper独立run仍是分模块合同，不因共享core升级为集成证据。

metadata仅合成R1-R7七SELECT，无cipher/token输入、R8/V1/transport或secret授权；真实ID来自数据库的读取尚未实现/运行，不能把fixture ID放到真实批准清单。未来真实探查边界与共享配额缺口见v041。

## 限定与后续

请独立QA按六包审核、复跑及追加自有负测，原件和报告齐后最多签ISOLATED_FIXTURE_INTEGRATION_PASS及相应回归/metadata合同。真实SQL schema/驱动cancel/destroy/解密/网络/provider schema/费用/国内影响无新增证据；metadata/signer/reader/integration生产入口恒拒。同步JSON解析只做前后deadline检查，不声称硬实时或内存物理擦除；offline guard非恶意JS/Proxy沙箱。

真实三站抓取入库/AI、生产持久目录、排他/唯一消费者、readiness/回退仍未交付。本批fixture通过不能替代真实目标。待QA与经理收口，无真实SQL/secret/HTTP/token/AI/DDL/ACL/服务/账号刷新/registry写/push/发版；proof恢复/进度链继续停止。

## 变更记录

负责人依据员工只读建议修首版无效registry负测与过短deadline场景；未弱化失败关闭断言。最终六组开发通过并新冻结，员工最终复审无新阻断（只读，未执行测试）。未改经理唯一待办。所有旧冻结和失败原件保留，无删除/覆盖。
