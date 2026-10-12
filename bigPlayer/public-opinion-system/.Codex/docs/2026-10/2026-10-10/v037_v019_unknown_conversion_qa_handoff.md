# v019 unknown本批临时能力转换隔离交接

Status: FIXTURE_CONVERSION_PASS / ORIGINAL_FROZEN_SCOPE_ONLY / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

独立签收更新：`.tests/2026-10/2026-10-10/v035_v019_reader_conversion_independent_qa.md` 已限定签收fnClEp：8/8及自有4/4组、前后5文件bytes/hash一致。仅原冻结 FIXTURE_CONVERSION_PASS；活动树后续私有核心集成不在该签收内。QA_PENDING为历史交接状态，真实registry授权/真实链继续HOLD。

## 本次变更与设计

`scripts/overseas-v019-observation-contract.js` 增加 `probeFixtureIdentity` / `convertFixtureProbeToSample`；新增 `server/test/overseasV019ObservationConversion.test.js`。原sample继续严格拒unknown。仅明确允许的auth-only发三站各exchange/context/board，合计9、feeds0；全部同批成功后私有 WeakMap 单次proof才可转换。失败没有proof；复制/重用/观察身份漂移/过期拒绝。

转换只产生本批临时fixture能力，sites的authorized值为合成临时值，返回的observedFixture不是registry新观察、更不是真实授权；原registry输入保持unknown且字节不变。转换沿同nonce、私有HMACkey、sessions、已读字节、绝对deadline和请求上限；只发剩余15槽（10..24），不再次exchange，整批9+15=24、exchange3、feeds6。全批8MiB跨两阶段累加，认证收紧的总deadline及请求deadline不得在取样重新扩大。

生产签发仍恒拒；fixture proof不被任何生产reader/signer接收。真实context/board schema、新鲜registry观察、真实authorization品牌与transport集成仍NOT_TESTED；不把内部固定payload模拟当真实三站交付。

## 冻结与开发验证

所有 `.temp` 路径相对仓库根 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage`。

| 项目 | 当前原件 |
|---|---|
| 冻结目录 | `.temp/v019-contract-conversion-fnClEp/` |
| manifest SHA256 | `b056df54d92a729e4e1d0466794412a2c3ce6b4e8e636c70f17e8e0385e0adc3` |
| 共用模块 SHA256 | `b8c28543bb2e573b09a768ef3ec18859ffd5265010447b0529c6ff4fdc57dedf` |
| 开发原件 | `.temp/v019-contract-dev-pCextE/result.json` |
| 原件 SHA256 | `29f1902888de193f2b141d92c13ff3588746512d890abf45abbf374b505f1049` |

开发8/8、exit0、passed/unchanged=true，前后5文件bytes/hash。覆盖9+15槽/exchange3、原registry不变、unknown sample拒绝、proof复制/重用/漂移、各站context/board失败无proof、200ms收紧deadline等待后不能转换、30ms请求上限不能放大、实际合成流跨阶段累计恰超8MiB+1首sampling响应即停、生产拒绝与报告脱敏。自然5min等待未测；采用内部合成流，不是网络取消实证。

## 交接与变更记录

请QA在fnClEp冻结cwd执行 `node scripts/v019-observation-contract-freeze.js --verify <上述SHA>` / `--test <同SHA>`，加自有proof/时限/字节/registry与脱敏负测；只签本批fixture转换。原I1/I2 4BXp0C/avtmye签收仅原冻结，不覆盖本增量。员工提出跨阶段字节与deadline重置阻断，负责人修复并开发验证；旧冻结全部保留。没有registry/真实账号刷新、SQL/HTTP、服务/国内、生产DDL或push/发版操作。
