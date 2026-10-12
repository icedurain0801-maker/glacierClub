# v104 四组无端口补验冻结交接

Status: DEV_TEST_EVIDENCE / QA_PENDING / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

独立限定签收已收：`.tests/2026-10/2026-10-10/v033_v104_four_offline_subsets_independent_qa.md`，FOUR_OFFLINE_SUBSETS_PASS；独立34/34/guard拒绝空，675项前后verify、673文件及2workspace links与UI asset一致。独立执行原件根.temp/v104-offline-dev-H8WRL7/result.json SHA `36500979a4d679d36ed57f0e3b0117f3af817eec28a6f6ab52dd6e3174d65fa2`，runner字段仍DEV_TEST_EVIDENCE，独立报告签范围，不改写原件kind。原18项NOT_TESTED、fresh process/shared/真实SQL未验及生产HOLD保持。以下QA_PENDING为原交接历史。

仅新专用集合，不执行原18排除测试。员工审依赖/提出建议，负责人审核并唯一落地四个测试文件及 `scripts/v104-offline-subset-freeze.js`。原文件/断言不弱化，原18项历史NOT_TESTED不变。

| 新文件 | 原断言保留 | 未覆盖 |
|---|---|---|
| worker/test/overseasManualHandoffOfflineSubset.test.js | 13项Repository原型+内存事务fixture/真实合成receipt文件读回、marker CAS、故障回滚/ACK未知只读、篡改/身份/窗口拒绝 | 非真实SQL；fresh Node和后6恢复/Progress用例不纳入，不触停止proof |
| worker/test/schedulerModeOfflineSubset.test.js | 2项mode归一化/显式合法值纯函数 | 不import worker/q1/daily，不签CLI/legacy gate/shared入口 |
| server/test/unifiedSchedulerMigrationOfflineSubset.test.js | 原15项023迁移文本断言 | 仅读SQL文本，不DDL/readiness |
| server/test/publicOpinionSourcesMultisiteOfflineSubset.test.js | 原4项UI sources文本断言 | 不eval JS，不浏览器/HTTP；仅读冻结asset |

manual fixture路径只能新冻结root.temp目录，由固定路径推导仓库根、realpath/.git/.temp核验；不使用调用方env或原fallback。合成receipt文件保留，不删除旧证据。完整依赖闭包含first-party/已安装依赖但只运行精确四文件；存在恢复模块字节不构成恢复许可。

冻结：仓库根 `.temp/overseas-v104-offline-PPamKx/manifest.json`，SHA `77818cb67c47e51df0f6bd570122e4ec433ca2fb9f36ab78e42e7afcb4430e62`，675 inventory项，另独立UI资产。资产来源 `bigPlayer/admin/PublicOpinion/assets/sources.js` → 冻结 `contract-assets/bigPlayer/admin/PublicOpinion/assets/sources.js`，SHA `e7a50696141b1455aa44fef4bd2d19cfe7cad29bd00cb2a9421657380976af88`；023 SQL纳入inventory。manifest前后verify核全部字节、workspace限定link与asset。

精确命令（冻结cwd）：

```text
node scripts/v104-offline-subset-freeze.js --verify 77818cb67c47e51df0f6bd570122e4ec433ca2fb9f36ab78e42e7afcb4430e62
node scripts/v104-offline-subset-freeze.js --test 77818cb67c47e51df0f6bd570122e4ec433ca2fb9f36ab78e42e7afcb4430e62
```

runner仅白名单OS临时环境，实际调用固定Node+guard、no-isolation、四文件；测试进程不得child/env/socket/DB/DNS/UDP/Worker。spawn仅固定测试编排，不是业务fresh-process证据，不放开测试guard。严格exit/TAP34测试/34pass/fail0及guard拒绝0联合判定。

开发原件：根 `.temp/v104-offline-dev-eUWoTb/result.json` SHA `e9d627b712fd9723b03457053e00be79fc79baa0bd695528a105a335e943e7cb`；实际kind DEV_TEST_EVIDENCE、exit0、passed=true、unchanged=true；34/34、guard denials空，sql/port/production=false。无端口owner，不占13316。请QA先审新入口/闭包与原断言保留，再独立前后verify与精确命令，原件/hash齐签限定范围；开发不代签独立PASS。

真实身份/transport I1-I3另单优先推进，不用四组外围通过替代真实目标。fresh SQL差集仍DESIGN_ONLY，不执行通用--isolated；国内及其他平台不运行，HTTP/token/AI/DDL/ACL/服务/生产HOLD。

## 变更记录

仅新增四个专用测试和冻结/验证runner，另本交接。首次冻结开发34/34通过；未改业务代码/原18文件、未SQL/HTTP/服务，未commit/push/发版。
