# v019 reader与逐请求transport隔离集成小单方案

Status: FIXTURE_IMPLEMENTED / DEV_TEST_EVIDENCE / QA_PENDING / REAL_INTEGRATION_NOT_TESTED / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

## 派单后实现更新

经理已批准并派单，本方案的私有核心/兼容wrapper、逐槽V1、reader秘密消费、同批预算及生命周期已隔离实现；六组最终开发验证与新唯一冻结以v039变更记录及v040交接表为准，待独立QA。下文NOT_IMPLEMENTED及待派单为原设计历史；拟integration命令现已实际实现，只能在v040新冻结按精确SHA运行。原Kxx61Q/fnClEp已独立限定PASS，不覆盖新增core。未来非秘密metadata入口fixture实现及真实driver/共享配额缺口见v041；真实执行继续HOLD。

## 原批准方案历史：目标与依赖

下一小单只验证合成 reader→私有apiToken→每槽V1→内部合成transport→unknown同批转换的完整顺序与失败关闭。当前v036 reader与v037 conversion是分模块候选，单测不证明这个链已装配。先由项目经理确认小单范围并派单；新候选交QA前核原reader Kxx61Q、conversion fnClEp独立报告，未签收或有缺陷按报告修复另冻结，不复用旧hash代表新代码。

当前依赖路径：`scripts/overseas-v019-isolated-reader-contract.js`、`scripts/overseas-v019-observation-contract.js`、`server/test/fixtures/overseasObservationIdentity.js`、`scripts/v019-offline-network-guard.cjs`、`scripts/v019-observation-contract-freeze.js`。原冻结只读保留；不从根.temp导入运行时代码。真实mysql2/secret解密/网络/provider schema/registry新鲜观测均不作为本小单依赖，不为补证启动真实服务。

## 推荐技术方案

采用同一私有模块内装配：拟新增 `scripts/overseas-v019-fixture-integration-contract.js`，承载reader、身份、秘密与transport的私有执行核心；现有两个专属模块作为兼容wrapper复用核心。不公开token resolver、任意beforeRequest callback、driver/transport注入工厂或跳过V1开关。重排依赖时消除reader对observation的循环引用；仅提取本两个专属合同的内部逻辑，不动共享业务connector/worker。若实现发现需要扩大业务文件范围，回经理调整派单。

公开入口只接受严格data-only固定synthetic fixture与声明式故障，内部生成opaque批次能力、nonce、固定manifest/plan绑定及单调绝对deadline。R1-R7读取后冻结原registry/config身份；R8仅一次，apiToken直接在内部合成exchange消费并核验与reader秘密品牌一致，不再独立生成与reader无关的root token。refresh可能包含在读取的envelope，但不进入runtime能力/日志。

每槽顺序固定：原身份/期限与密文版本新观察核验→短事务V1成功并rollback→本站精确request descriptor及session校验→合成transport/stream。V1失败时当前槽transport启动数为0，其后V1和请求均0；禁止先运行全部V1再发请求。原registry保持unknown，context/board成功产生的临时授权单独存私有proof，不把临时authorized快照拿去替代V1的原registry观察。

同一批次从R1之前开始计时，包含读取、秘密消费、9认证及15取样；5min整批、1s查询、10s请求只能收紧，全部body共享请求绝对deadline，认证到取样继承累计8MiB与单响应1MiB限制。三站exchange最多3、总请求24；R1-R7七SELECT+R8一SELECT+每槽一次V1最多24，共32。auth-only停在9请求、17SELECT；unknown认证后继续取样仍同一32预算，不能另开reader刷新为第二批。失败整批停止，销毁合成连接、取消reader、释放私有proof/session/secret引用，无重连/刷新/retry。

## 拆分与验收

| 项目 | 产出/验收 | 当前状态 |
|---|---|---|
| 私有核心与依赖重排 | 一个品牌持有reader/secret/proof/transport，旧wrapper兼容，生产入口恒拒 | 待派单实施 |
| 每槽强制V1及秘密消费 | 24槽逐一证明V1先于transport，reader token被实际消费，无法绕过或跨批复制 | 待实施 |
| 原registry与临时proof分离 | 两unknown成功后9+15，原观察不变，任何新registry/config/cipher漂移拒绝 | 待实施 |
| 全批资源生命周期 | 单deadline/bytes/SELECT预算，失败后后续0，成功及失败均清引用 | 待实施 |
| 集成负测 | 拟新增 `server/test/overseasV019ObservationIntegration.test.js` | 待实施 |
| 新冻结/开发验证/独立QA | 新manifest及依赖闭包、前后hash，DEV原件与独立报告分开 | 待实施 |

必要负测包括：所有24槽V1分别失败当前transport0；R8失败HTTP0；账号/凭据/原registry/config在第N槽变化；同IDcipher替换；凭据自然到期；metadata/secret/proof跨批复制；绕过V1/外部callback/未知选项拒绝；query超时销毁后query/rollback0；认证与取样跨阶段deadline/bytes累计边界；token错值/跨站token；32/17预算；生产签发/reader入口恒拒；报告/错误/trace不含token/refresh/cipher/URL/query或原身份。测试仅声明式合成故障，不以任意callback冒充信任边界。

## 原批准方案历史：拟命令与冻结边界（当前命令以v040为准）

当前runner只支持identity/stream/reader/conversion，**integration命令尚不存在，以下为下一小单拟实现接口，当前不可执行**：

```text
# 拟在活动项目cwd，落代码及测试后生成新的唯一根.temp包
node scripts/v019-observation-contract-freeze.js --freeze integration
# 拟在该新冻结cwd，以新manifest实际SHA运行；不能填Kxx61Q或fnClEp的SHA
node scripts/v019-observation-contract-freeze.js --verify <新integration manifest SHA256>
node scripts/v019-observation-contract-freeze.js --test <同一新SHA256>
```

runner需显式新增integration阶段的精确文件集合与断言数，封闭网络guard、白名单OS env、冻结前后bytes/hash、60s测试编排timeout、实际kind DEV_TEST_EVIDENCE。新增文件全部进入新manifest；不得修改旧Kxx61Q/fnClEp或伪造复用它们的QA结论。已有两阶段若wrapper受影响需在新冻结版本最小回归，与新集成测试分别记录；无需重跑旧只读包作为新证据。禁用通用 `--isolated` 及生产/live入口。

## 交接口径与变更记录

即使未来独立QA通过，也只签 ISOLATED_FIXTURE_INTEGRATION_PASS；不能称真实SQL连接取消、真实secret读取、真实HTTP采集、生产入库、AI完成或真实执行链交付。所有真实操作、生产/国内、服务/DDL/账号刷新/push/发版继续HOLD。真实下一阶段需另有精确决定及独立证据。

本次只提出技术方案与命令设计，未实施集成、未新增测试执行、未修改旧冻结、未改经理待办；现状仍 INTEGRATION_NOT_TESTED。
