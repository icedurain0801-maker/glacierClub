# v104 当前 hash 覆盖差集与安全入口矩阵

Status: READ_ONLY_SCOPE_DESIGN / NOT_EXECUTED / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

## 范围

承接经理对v030映射的核收。本次只做代码差异、独立报告和18排除入口核对；不执行测试/SQL/HTTP，不占13316，不创建freeze，不重新开启受限恢复proof，不改旧事故证据。当前核心hash及9io1Ti清单锚见v030。没有已证实业务代码缺陷，本表列的是当前版本证据覆盖差集，不能写成代码未实现。

## 已验与差集

32AVIO至当前：ledger净差异52新增/13删除、BoundAudit24新增/11删除、PageStore7新增/1删除（只读git no-index差异，不是修改计数）。主要新增scheduled私有proof/context、admitted schema bootstrap、写前/写尾父fence、terminal只读fence和审计字段严格校验；manual保留旧路径但不能仅据此转移全部旧PASS。

| 当前变更/原负例 | 已有独立证据 | 真正待核范围 | 下一小单动作 |
|---|---|---|---|
| scheduled proof缺失/null/复制/跨repo/journal及page/audit尾父漂移 | 10月9日v086，Vd73p7，独立13组SQL；旧缺陷已局部关闭 | 该报告是当时版本；当前版本完整负例覆盖关系待按函数/断言逐条确认 | 只核变更行对既有断言，不重跑已签矩阵充进度 |
| 当前schema bootstrap、同页comments/replies/封口、唯一links计数 | 当日v014，9io1Ti与当前核心hash相同；各站4内容/6任务/父8计数 | 成功链不涵盖所有旧ledger故障矩阵 | 在当前版本定向补下面未覆盖负例，不重建实现 |
| actor/sourceEffect/终态字段与分析告警计数 | 当日v009，s6iWAb三核心hash相同，60负例；fresh manual24 keys及只读零写 | 全原始DB列未测；manual recover/progress未运行 | 已测项移出待跑集；未要求全DB列时不扩大需求 |
| manual同页派生任务 rollback、登记/seal竞争、missing task、错run/窗口CP、schema漂移不删任务 | 候选17v083及其ledger矩阵局部PASS | 当前ledger/PageStore变更后的这些断言未见同hash完整独立重签 | 从checkLedgerMatrix摘出对应fresh/manual首claim矩阵，新专用mode；禁通用--isolated |
| audit create事件故障、audit/source终态失败全rollback、ACK未知只读accepted、旧无绑定manual_review | v083已有原始矩阵；v009当前manual正常完成/失败已验 | 正常终态不替代上述故障注入；当前hash故障差集待补 | 复用故障断言，记录受检表基线与零补写，不清理旧audit |
| epoch1 posts/comments/replies、重复feed/context归属、links hash与计数版本 | v014当前合成成功链；v083更广links负例 | 当前hash对重复feed/context篡改的定向负例尚未单独映射签收 | 仅同进程原firstClaim epoch1数据负测；不运行恢复epoch2 |
| page commit后新进程恢复、epoch2 Progress、受限proof执行 | 旧v083是历史局部证据；v014 recoveryExecuted=false | 当前恢复证明不闭合 | STOP：不纳入下一命令，不借旧JSON/proof补权，不重试 |

本表的“待核/待补”均是证据范围，不是已复现bug。进一步复核若找到当前hash已有对应独立报告，应直接关闭映射缺口而非重复运行。

## 新小单范围、命令与owner

推荐最小单：新增独立的 fresh firstClaim-only ledger/audit/PageStore 差集入口，只复用 `scripts/overseas-isolated-ledger-checks.js` 中不涉及恢复的原断言，补当前epoch1 links负例；不调用通用 `scripts/overseas-isolated-mariadb.js --isolated`，该入口含恢复/progress子分支。实现阶段先读matrix完整依赖，证明新mode不进入停止分支，再补入口失败退出与owned shutdown。此为建议单，尚未实施/执行。

| 步骤 | 精确命令/状态 | owner与边界 |
|---|---|---|
| 当前只读映射 | git diff --no-index及manifest读取已执行 | 开发；无端口/SQL |
| 新专用mode | 建议 `node scripts/overseas-isolated-mariadb.js --isolated-v104-current-delta`；当前不存在，禁止直接执行 | 开发先实现硬mode分支及身份校验；不回落--isolated |
| 冻结包含项 | core schema/ledger/audit/identity/facade/PageStore/Progress/factories；新差集runner及直接依赖；guard和选定tests；firstClaim fixture/journal但不授恢复权 | 生成新独立inventory/manifest，旧包不改；依赖闭包不等能力放行 |
| 冻结校验 | 现有 `node scripts/freeze-overseas-scheduled-candidate.js --freeze` / `--verify <snapshotRoot>`；必须先将新差集mode与精确测试集列入新manifest | 此轮未运行；不使用活动树代替冻结测试 |
| 离线 | 只在新冻结guard下运行明确选定test文件；具体文件和命令随入口实现后manifest列出 | 不跑18排除；不加载.env/默认DB |
| SQL及独立QA | 开发与QA各自fresh自有实例，串行执行新mode，前后verify/raw/hash齐后流转 | 13316须QA明确释放且读监听/身份核验；不接管QA，不连接3306 |

本轮owner为开发只读映射，无端口占用；任何未来SQL启动前均须核QA owner空闲和停止释放，若未释放则继续离线工作。不创建第二生产consumer，不HTTP/AI/DDL生产/ACL/服务切换；整体NO_GO/HOLD。

## 变更记录

## 18排除逐文件安全入口矩阵

员工逐项只读核入口/import，负责人交叉核manual handoff/scheduler mode/迁移文本/UI资产关键路径。以下每项原状态均NOT_TESTED，建议不是已运行或已放行命令。原文件不为通过而改弱断言，guard不整体解禁child/env/listen。

| 文件 | 实际边界与v104关系 | 安全替代设计 |
|---|---|---|
| server/test/app.routes.test.js | env/default3306、建表/删数据、HTTP监听；API外围 | 原入口停止；另拆纯handler+内存repo。真实SQL另有owner/目标写前校验，禁止重跑旧事故 |
| server/test/domesticReadonlyExecutor.test.js | 43322本地HTTP、外部原件；国内外围 | 内存request/response、SQL guard纯函数，外部证据完整fixture冻结，无端口 |
| server/test/facebookSecurity.contract.test.js | connector注入fetch，但末尾app/listen/socket；非目标回归 | 分离纯connector与无socket真实handler，env/mysql强拒 |
| server/test/lastNightAuthorizationCheck.test.js | 合成transport及缺plan CLI子进程；旧工具 | 进程内main缺plan、DB/env/transport零调用，不真实授权/proof |
| server/test/lastNightRuntimeInventory.test.js | fs/root.temp及loadEnvFile mock；旧库存 | 完整冻结fixture，单进程guard；env mock兼容需专门设计 |
| server/test/publicOpinionSourcesMultisite.contract.test.js | 读项目外admin/PublicOpinion/assets/sources.js；UI外围 | 新清单纳入精确UI资产/hash，fs-only，不读未冻结工作树 |
| server/test/runtimeEnv.test.js | 合成env/symlink/清理、os.tmpdir；启动外围 | 独立root.temp fixture，限制固定文件/env读取范围；拒DB/network/child，不解除真实env guard |
| server/test/sourceDetailRoute.test.js | env mock/app与listen/fetch；API外围 | 真实handler内存request/response，pool强拒，无端口 |
| server/test/syncRunRouteCompatibility.test.js | Repository builder fixture/本地socket；读取兼容外围 | 无socket handler，保留真实SQL builder和pool零调用 |
| server/test/unifiedSchedulerMigration.contract.test.js | 当前代码fs-only读023 SQL；scheduled外围 | 可选新deny-guard文本测试，清单纳入SQL；不执行迁移。旧manifest排除理由不改写 |
| server/test/v019CandidateStartup.test.js | 另一API candidate root/env/Module._load合同 | 独立release清单；v104另测import无副作用，不冒充原API release |
| server/test/v019ReadCandidate.test.js | API release/baseline双清单、仅两文件变化合同 | 需其原release/base双冻结；不削弱断言迁就runtime包，维持独立未验 |
| worker/test/lastNightBoundedRuntime.test.js | 合成repo/transport及CLI child；旧侦察 | 纯运行函数、单进程main缺plan；不live/proof |
| worker/test/lastNightOverseasDailyJob.test.js | fixture/dry-run child；旧调度 | 单进程dry-run与guard计数，不代替新scheduled父子合同 |
| worker/test/lastNightTransportSafety.test.js | TLS env/child CLI；传输外围 | 单进程合成TLS状态隔离恢复，缺plan/import测试；网络仍拒 |
| worker/test/overseasManualHandoff.test.js | SQL fixture/root.temp receipt/fresh Node读回；核心相邻 | 先拆无child的事务fixture；fresh-process保留独立精确child guard合同，同进程不替代新进程证明 |
| worker/test/q1DailyJob.test.js | injected业务及真实spawn Node假crawler、传递child import；国内外围 | 拆daily/report/cap无child集合，crawler解析纯函数；spawn继续未验，不启动Python crawler |
| worker/test/schedulerMode.test.js | 纯mode与真实worker/q1/daily child入口；核心相邻 | 拆纯mode/legacy gate；真实entrypoint另需固定无效mode/early-yield、白名单env/child guard，未验不计shared入口PASS |

优先无端口补测单：manual handoff纯fixture、scheduler mode纯集合、023迁移文本、完整冻结UI资产四组。必须新建专用测试文件/选定集合并明确直接依赖，无child/env/socket/SQL；未实现前不列可执行命令，不把原18文件标PASS。新fresh进程合同仍NOT_TESTED。此单与上方fresh SQL差集分开冻结/排期，可在QA占13316时实施。

新增覆盖差集与安全入口设计；补充v030当前v009精确覆盖。旧独立结论/旧包不改，未重跑旧PASS，未提交推送。18排除逐文件矩阵见下方追加记录。
