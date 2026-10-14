# 预算账本语义完整性隔离增量 QA

Status: ISOLATED_CALL_ACCOUNTING_SEMANTICS_PASS_FULL_RUNTIME_HOLD

一句话需求：独立验收used1→0、预算删行/scope/day重标、call-charge归账日与计数cap对账，以及原日/满cap预付合法消费。

已拍板：仅当前模型，自有13316/serverId20261036/po_overseas_fixture，串行每连接PID/datadir/schema核验。开发H9fNi3/AxN9jw已停止释放，端口listener0。无生产DDL/3306写/国内变更/HTTP/AI/通知/第二consumer/受限proof入口，FULL_RUNTIME_NO_GO/CUTOVER_HOLD。

## 实现策略

`server/src/db/overseasIsolatedCallBudget.js`仅fresh fixture新增mutex与8字段charges。固定mutex→排序全budgets→charges/calls→manifest→实时source/content/job锁顺序，预算集合与扣账投影逐一校验used/cap，charge与call的identity/day及hash一致；已扣账桶缺失不能INSERT IGNORE重建。reserve同事务扣计数/插call和charge，消费只变call状态并插disabled outbox，不退款。六字段receipt不变；跨日consume沿原预付UTC日，不创建当日桶；归账日是取得accounting锁时UTC日而非commit日。

全账扫描只对有限fixture，非生产规模方案；hash是单账本漂移校验，不抗管理员协同重写多账本/hash。outbox/status整体管理员篡改及完整runtime不在本批。新增DDL不是生产迁移授权。

## 冻结与命令

最终仓库根 `.temp/overseas-qa-scheduled-stage-2zzkfb`，700 files，manifest SHA `f70a63cb548af7f5b4dd9ebb00af96abc89c97060e48e242e04f6f22821dbbf7`。原PkTSR5保留为开发42负例/46兼容原件包。最终仅补helper两测试，业务Budget SHA `cec1cdb550d4fbd443aefcb6647fc39c15dfef4f2dee5296864de823632e2855`及translation helper SHA `47cdd1c1ff8be809bbf388f341217735a1bebf709f0266130b7caa8bd4844af4`与PkTSR5逐一匹配。最终开发semantic已44负例和新mutex竞争PASS，QA在最终包fresh重跑兼容，不冒称开发46在最终包重跑。在最终冻结根前后运行 `node scripts/freeze-overseas-scheduled-candidate.js --verify <最终SHA>`；独立串行fresh：

1. `node scripts/overseas-isolated-mariadb.js --isolated-call-accounting`
2. `node scripts/overseas-isolated-mariadb.js --isolated-translation-call-budget`
3. `node --require ./scripts/offline-test-guard.cjs --experimental-test-isolation=none --test worker/test/overseasControlledManifest.test.js`

不要运行旧baseline diagnostic求修复PASS，也不运行旧analysis --isolated-call-budget（其人为day rekey现在应拒绝，旧PASS保留不是当前兼容证据）、通用--isolated、旧一小时等待或受限恢复入口。

## 开发原件 SHA256

以下均仓库根.temp，SQL/离线/verify子命令exit0：

| 原件 | SHA256 |
|---|---|
| PkTSR5-dev-accounting.raw.txt | c079fceeeadd6e503b24186423169c83dc2308e2837c3da97c0169e150a520ac |
| overseas-real-db-H9fNi3/result.json | ee21b2f6f721c617e789a1a5a939b7e740facd3f357457f2303f15fd26d18b3a |
| PkTSR5-dev-translation-regression.raw.txt | 6011c98df4483d14738af7d5fed70173759a6ada94be27834b220bbd6f589e71 |
| overseas-real-db-AxN9jw/result.json | d2aeb68c8ed562db710eef0c2e511afee4211779c6935855b5af7c97c4661da8 |
| PkTSR5-dev-offline.raw.txt | 58ed6e170663cfc37ac41d3ce5634dd6f96bc9df6671b2e09fc4de8461a5b8f9 |
| PkTSR5-dev-preverify.raw.txt及postverify | d3373c44d538f44b3be995cc452855f9e190c65c16fa43b34a72ac8335f6b5c1 |
| 2zzkfb-dev-accounting.raw.txt | 2ad0c261ba6366c6226588f9dfdf30bf62829b708c2a9282f9385cbb057442e7 |
| overseas-real-db-YQ9IU5/result.json | 1c4a4daf1ffb4b6c1e9e799270f4296f14590f21ac1052b73fee95d550cc3a78 |
| 2zzkfb-dev-postverify.raw.txt | d3373c44d538f44b3be995cc452855f9e190c65c16fa43b34a72ac8335f6b5c1 |

先复现旧baseline hHOvrR/manifest cc0a858c361f646975c2a0bacb8748097ab735ae6d1e589d01e1a33059bf896a：used raw f04df5670e1d40d59cc647be76942e1b792024c0fa62e66c39880e75161906e2/result X80f1y 4e3ddf8b410c47f1351d3716472aedd6963aa67580ee9a9626f8b4edc176328c；delete raw 698dc9cdbd546eeb220e485a13abfcd4547324d9b27d8cd3e0fcd04c7b0bf807/result zHgV5Q 64b75cb7616015a100935590d550b687a32fbaf761b4ed4f52ceb9c183b4a754。旧consume实际接受used0，或重建被删除global used0，均提交fake_consumed+disabled outbox；损坏夹具未恢复，只停止自有实例。两diagnostic不是release验收。

## 结果与证据边界

新semantic42负例：global/scope used1→0、删桶/day/key重标、call day/scope/tuple漂移、charge删行及七字段漂移、guard缺失、满scope拒新reserve/拒重复消费；每项11表漂移后零写并恢复。实际原日reserve使用合成session timestamp，连接销毁不归池，正常时钟consume不造新日桶，重放零写，再新日reserve至scope4、预付consume合法；最终旧日1/新日3/scope4、4charges/2disabled outbox，job pending/attempts0。不是实际跨午夜证明。

原translation46负例在PkTSR5新对账业务fresh通过，global/scope均cap4/used4后原receipt消费合法；offline7项PASS。最终2zzkfb补合法FK下call.manifest漂移两拒绝及新mutex最后槽两独立reserve竞争：1成功/1预算拒，call/charge3→4，最终旧日1/新日3/scope4、预付consume成功；44负例11表零写恢复，winner本身成功写入不叫零写。YQ9IU5停止释放productionTouched=false、后verify700通过。真实午夜、生产规模账本、第二槽执行/持久排空/完整runtime仍未完成。请QA独立raw/result/hash/报告并核停止释放，不以开发原件补独立PASS。

独立QA已核收：`.tests/2026-10/2026-10-10/v012_budget_accounting_independent_qa.md`完整已读，7份QA原件SHA逐一重算全部匹配，两result停止释放/productionTouched=false核验，最终冻结额外verify=true/700。44负例11表、46兼容及7离线独立PASS；新mutex单赢家/原日和满cap预付消费局部收口。真实午夜、生产规模及完整runtime依旧未验，FULL_RUNTIME_NO_GO/CUTOVER_HOLD不变，未commit/push/发版。
