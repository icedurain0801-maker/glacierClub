# 候选17 manual 最终冻结交接

Status: QA_NO_GO_UNSAFE_TEST_RUNNER / RUNTIME_NO_GO
Date: 2026-10-09

## 安全退回：本交接命令停用

QA发现测试集合包含 `server/test/app.routes.test.js`，其前置流程对真实 `public_opinion_test` 执行DDL/DML。三份旧raw的独有路由用例成功，证实该前置流程已执行；日志未记录实际host/port/serverId，历史实例身份待确认。没有证据证明生产 `public_opinion` 表被修改，但PID连续不能证明数据库零写。撤回此前“完整离线”“生产未动”的结论，1161/1161仅保留历史执行记录，不作为安全可复跑或独立QA放行证据。

下方旧 `--test` 命令禁止运行；旧快照和raw原样保留，不修改、不清理、不回滚数据库。工作树runner已失败关闭，待新安全包替代。独立13316 SQL中的 `productionTouched=false` 仅描述该SQL runner，不覆盖其他测试进程。先只读影响核查，再重新冻结并消息交QA；当前无可放行候选。

一句话需求：独立验收海外manual专属账本、同页评论/回复任务、恢复、run/epoch绑定审计、原子source终态、持久计数及隔离安全入口。

已拍板决策：经理/QA确认manual完整闭包与scheduled另批；scheduled必须关闭且NOT_IMPLEMENTED/NO_GO，不宣称v104全部海外完成。只当前模型；无生产DDL、服务切换、真实HTTP、账号刷新、AI/翻译消费、commit/push/发版。

## 唯一当前QA目标

`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-candidate17-manual-u6AIuO`

清单 `manual-freeze-manifest.json` 外部SHA256：
`4d6b0ffc24adcca7d3cf5e67262c56a882acb26face3a7e52782031e0e30279e`

875项完整代码/installed dependency/测试依赖冻结，Node v22.22.0、MariaDB 10.4.14-MariaDB。旧MzURrH与M8rctf均因打包测试依赖漏拷离线失败，保留不改、不删，绝非QA目标；v106仅历史。最终包补正式Python源但不执行crawler。

在当前快照CWD：

```powershell
node scripts/freeze-overseas-manual-candidate.js --verify 4d6b0ffc24adcca7d3cf5e67262c56a882acb26face3a7e52782031e0e30279e
node scripts/freeze-overseas-manual-candidate.js --test 4d6b0ffc24adcca7d3cf5e67262c56a882acb26face3a7e52782031e0e30279e
node scripts/overseas-isolated-mariadb.js --isolated
```

额外启动零副作用必测：仅本命令进程设置 `PO_ISOLATED_CANDIDATE_ROOT=当前快照根` 后 `node --test server/test/v019CandidateStartup.test.js`。开发1/1通过，QA独立重跑。

清单及工具可被本地用户改写，因此QA另用独立Get-FileHash核外部锚前后不变，再运行强制SHA参数工具/875前后哈希，不能只相信自证。清单若实际含workspace junction，只允许指向此快照server/worker的两个特例，非泛化无reparse。

## 精确排除和未证明

- `server/test/v019ReadCandidate.test.js` 针对另一个395文件、两文件差异v019 release manifest，非本包发布等价测试；不执行其构建/生产baseline切换。NOT_APPLICABLE_TO_THIS_RELEASE。
- `server/test/publicOpinionSourcesMultisite.contract.test.js` 仅读项目外sibling admin资产，工作树全server已通过；runtime包不含UI页，单列外部UI契约非本包PASS。
- `v019CandidateStartup.test.js`虽总集合排除，额外单独必跑，不隐藏安全测试。
- 首次queued0 CAS commit后ACKlost或Journal前中断：失败关闭保running缺Journal，不自动接管，不声称可恢复。
- CP表无run_id，同维度CP不证明origin run；外run descriptor/错窗口CP拒、本run账本无完成证据禁止已完成CP短路，不宣称任意CP provenance完整。
- RR历史枚举加逐root current-read FOR UPDATE复验，不称所有完整row同一snapshot；并发漂移更广组合未测。
- 内存固定RSS256MiB/heap96MiB为协作式安全判限，非OS硬限/物理压力；SQL回滚用隔离进程usage注入，limits不调低；不含MariaDB。
- 页/封口竞争测实际ledger.commitPage+CP同事务，人工CP/派生任务无provider内容PageStore；不能等同完整采集页竞争或吞吐测试。audit创建commit ACKloss、广义内容变化/context组合未测。
- 非目标实际SQL只验证恢复/原依赖路由、候选表零业务SQL及旧海外行不变，不代表完整provider采集。

## 逐行独立QA

按v081矩阵分别核canonical入口、queued0与exactIntent、schema-before-feed、同页任务、comments/reply before/after、新Node恢复、并发封口、漏任务/漂移/历史gap/固定预算、audit创建/终态/source rollback、ACKunknown只读、links分类/Progress、旧unbound、非目标SQL、scheduled关闭。总测试数不得替代新ledger具体用例。安全必项缺证据应FAIL/NOT_TESTED退回，不因开发局部PASS放行。

固定历史10000roots/10000ms，实际100/1000sealed、10k/10001可触时间限后rollback+partial；限不是硬deadline，10001未必碰数量限。合成transport无真实HTTP，分析/翻译pending不是消费完成。

## 开发结果

最终快照离线/SQL正在执行，原始结果收回后追加；未预写通过。工作树完整新增SQL19主项、ledger15矩阵通过，最后7fPYqw原件保留；不能移作快照PASS。旧首包离线1115/1128、第二1160/1161失败原件保留。生产只读基线：DB5900/2026-10-08 10:00:19，Worker19584/10:02:27，Frontend19768/10:02:25，未操作。

最终结果已收齐：当前u6AIuO快照完整离线1161/1161 PASS、exit0；额外startup1/1 PASS。冻结SQL `根.temp/overseas-real-db-MScMNW/result.json`为19主项/15ledger矩阵局部PASS、exit0，serverStopped=true/portReleased=true/productionTouched=false；仍按表内证据限制解释，不是独立QA/生产PASS。875项后hash一致、外部清单锚不变。

| 原始证据 | SHA256 |
|---|---|
| 当前快照 `offline-raw-1791543181905.txt` | `bb4ee59400e652181d028ebf5a0e784fe77cfc12ae78c59b5cb0d43028750f89` |
| `根.temp/overseas-real-db-MScMNW/result.json` | `5e3f6226c970353fc9ea60ebbd65542dbba2886e4eabe7bf9f2cec9cadd785ac` |
| 失败首包MzURrH `offline-raw-1791542862584.txt` | `502b837d9b984b9dc1f4fa0054ad465302d2ddd18370d5fa26a9ed43a079cfc9` |
| 失败第二包M8rctf `offline-raw-1791543042816.txt` | `12addeff9ea928bbd6270c7edb22fdc75013aa4191ec718ac44badf3bd72d047` |

## 请测试负责人执行

已真实消息发送测试负责人01a08404-2cd0-73c2-8511-e2f3f4885bf1和经理01a083d6-a4ad-7543-9050-783a06307f66；当前待独立QA，不是仅写交接文档。测试负责人接单后独立复跑，开发快照冻结不再改。

审脚本guard/owned SHUTDOWN、生产只读基线→外部manifestSHA/875前hash→完整离线+额外startup→全新自有127.0.0.1:13316/serverId20261036/根.temp新datadir SQL→875后hash与外部锚→自有DB退出/13316释放/生产连续性。每个原始证据另核SHA，独立报告消息交开发和经理，不改快照/业务代码；生产仍RUNTIME_NO_GO。
