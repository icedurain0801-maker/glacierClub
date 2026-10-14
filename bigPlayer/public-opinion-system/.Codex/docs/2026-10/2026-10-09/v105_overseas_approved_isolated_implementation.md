# v104 已批准隔离实施记录

Status: ISOLATED_MANUAL_PARTIAL_PASS / 18_EXCLUDED_NOT_TESTED / RUNTIME_NO_GO
Latest checkpoint: 新32AVIO安全包独立QA974/974离线及fresh13316 SQL19项局部通过；旧危险命令停用，历史DB归因未解决，scheduled另批。
Date: 2026-10-09
Owner: 开发负责人

最新收尾：v083独立QA结果及两份raw结果SHA已核实，详见v109。仅隔离manual局部通过；18排除、scheduled持久全链、真实HTTP及异步消费、历史DB归因/生产兼容与切换仍未完成。旧证据完整保留，生产NO_GO，未commit/push/发版。已向经理回报本批结果及剩余范围，由经理登记待办与下一批派单。

安全更正：三份旧冻结raw中的app.routes独有用例成功，证实真实 `public_opinion_test` DDL/DML前置流程已执行。历史host/port/serverId未被日志记录，实际实例待确认；尚无证据证明生产业务库被修改。撤回历史“完整离线/生产未动”总体结论；下文PASS和productionTouched=false均仅保留原测试的局部历史语义，不能证明整批零写或安全放行。旧快照/raw保留，工作树freeze测试入口失败关闭；无清理/回滚/重跑危险命令。

用户已弹窗确认“隔离实现并流转QA”；项目经理已评阅采纳同一方案，明确不重复普通技术审批。不是生产DDL、状态根/ACL、服务切换、HTTP或账号刷新授权。

## 实施顺序

| 顺序 | 产出 | 初始状态 |
|---|---|---|
| 1 | 两表正式候选schema与SQL账本：scope/epoch fence、schema immutable、task identity、历史同快照与预算 | 实现中 |
| 2 | PageStore同页任务登记、daily pending恢复、checkpoint归属、终态集合fence | 待接线 |
| 3 | 精确run/epoch绑定audit、同事务terminal、统一links计数版本、ACKunknown只读对账 | 待实现 |
| 4 | ordinary共享候选入口、scheduled旧schema合同/readiness、drain/安全回退、可注入但默认拒绝状态路径策略 | 待实现 |
| 5 | 开发离线/真实合成SQL矩阵、扫描预算实测与固定、非目标回归 | 待验证 |
| 6 | 新快照完整冻结及独立QA消息交接 | 待冻结 |

员工同当前模型，仅产出patch建议和审查；负责人用apply_patch唯一落地。生产不动，候选16及旧失败原始证据保留。锁顺序统一run→站点/source/account身份→manifest/tasks→checkpoint/content/audit；死锁默认失败关闭，不重发HTTP，不把COMMIT_UNKNOWN当可重试。

扫描初始保守上限10000候选roots、10000ms单快照事务（包括gap扫描和任务登记）。此为待隔离实测的候选限制，不承诺真实规模可运行；到限rollback并记录partial，不能假seal。

## 逐项记录

最终u6AIuO快照完整离线1161/1161、startup1/1通过；fresh frozen SQL MScMNW/result.json19主项/15ledger矩阵局部PASS、owned DB停止/13316释放，875后hash/外部SHA锚一致。v107正式交接含精确命令与raw SHA，首两个漏闭包失败包保留。manual交独立QA，不代表scheduled、完整海外或生产放行；本轮不commit/push/发版。

第二冻结M8rctf离线1160/1161通过，唯一失败仍打包依赖缺scripts/q1_crawler.py（q1ImportContract仅读源合同）；不排除安全导入测试、不改断言，机械闭包追加该正式Python源，保留第二包/原始日志另建最终快照。生产不执行crawler。

修正候选17另快照M8rctf共874文件，外部清单SHA2e9c95b6e59734d57f74acdceef72721da9943206fa601d5aae7323b7687f52a；startup1/1通过，完整离线和fresh自有SQL仍在运行。v106新增当前目标/外部SHA精确命令及排除项，首807失败包保留，不修改快照换PASS。

首冻结807包完整离线1115/1128通过、13失败：漏拷迁移/辅助脚本/installer依赖，原始日志保留，不能流转合格包。机械工具扩大正式测试依赖闭包（仅源码/脚本/迁移，无env/凭据），UI sibling资产contract另单列不适用runtime包；新增外部SHA必传verify/test防清单自签。首快照不修改不删，另冻修正包后完整复跑。

候选17新快照 `overseas-qa-candidate17-manual-MzURrH` 807文件冻结，manifest外部SHA锚80fd69138ded91200ab9a37b855a860aa6aee00ea2ca82829d5da92d3906d8ff；完整离线/SQL快照复跑中，尚未独立QA。额外startup候选测试1/1通过；v106交接逐行标注人工ledger竞争、内存usage注入、CP origin缺失与首次Journal缝隙、v019发布专属测试不适用，不能以总数或自签inventory掩盖安全缺口。生产PID/starttime不变。

Server非候选剩余失败定位为旧测试固定repo.calls[3]误选COUNT查询：getLatestSyncRun现会另读detail，调用序号多一条。业务list仍含AS runRole且项目另一读取兼容优化已存在；仅修测试按list调用中的projection/count识别，保留两个断言，不回改业务SQL或无关行为。待单测复跑。

新增机械隔离冻结工具，复制完整first-party源/installed dependency及离线测试/隔离SQL脚本闭包，全SHA前后核验，不加载env/不升级依赖；raw测试输出由脚本生成，保留失败。v019专属测试绑定另一个两文件release manifest，单列排除不修改旧测试；其默认全server失败保留。新candidate17尚未冻结，最后工作树SQL运行中，不宣称QA放行。

`NjJE8N`局部19主项含12项ledger人工事务矩阵及非目标恢复/路由真实SQL通过，owned DB停止/端口释放；新错窗口/gap用例随后落地，不能迁移为本轮已测。内存闭环补测仅在隔离测试进程临时替换process.memoryUsage观察值（固定256MiB限不变、finally还原），走真实SQL history部分登记后rollback、独立partial；不添加生产override，不冒充实际物理内存压力。规模报告明确limits及采样/收尾边界。待最终复跑。

全量worker离线561/561通过。全量server默认命令603通过/3失败，候选专用v019测试要求PO_ISOLATED_CANDIDATE_ROOT（未设置，不用生产路径绕过）；保留失败事实，冻结后用候选根重新验证。新增错窗口CP拒绝全行不变及真实历史缺provenance gap→rollback再partial用例，均不将CP schema无run_id泛化成任意跨run来源证明。待新运行。

新增audit创建绑定事件故障真实SQLfixture：核整个事务rollback且同source collection audit总数不增，避免snapshot按event JOIN漏掉孤儿；精确重试。新增外run/非canonical descriptor拒绝全行不变。员工另确认CP表无run_id，同维度CP本身不证明origin run；当前主链stageState须有本runledger完整证据才短路，后续对同身份completed CP的新run重放另核，不能泛称所有错run CP皆已拒。待新轮验证。

并发矩阵补actual ledger.commitPage与CP更新同事务后派生新comments任务：另一连接seal真实锁超时，提交后seal只能partial且新增任务保留。此为真实SQL账本page/CP派生竞争（人工完成CP、无provider/无内容PageStore写入），不把它称真实抓取整页竞争。待复验。

新增非目标真实SQL矩阵：自有13316同事务创建国内bigplayer/Discord/TapTap/Facebook及海外/未知/大小写错身份，实际bulk与canonical路由，候选表前后hash和原海外行不变，测试fixture最后rollback；无DDL、不执行provider采集，故报告限定SQL恢复/路由不代表完整平台采集。历史checkedSet物化后及refresh/seal间增加固定预算检查；待新轮复验。

`FqdA8W`新SQL18主项局部PASS含严格初次CAS主链与reply自身页before/after真实中断新Node恢复；自有实例停止/端口释放。进程启动于内存补丁前，不作最终新闭包PASS。新增两连接任务登记与seal竞争矩阵：真实不同CONNECTION_ID、另一连接ER_LOCK_WAIT_TIMEOUT证明事务重叠阻挡；commit后新事务检查登记先到→partial、seal先到→禁止追加。这是人工ledger登记/CP fixture，不冒充真实PageStore内容页竞争，后续QA需区分。

历史内存门禁经员工建议审查落地：固定Node进程RSS 256MiB/heapUsed 96MiB（依据本机合成峰值约102MB/31MB保守选值），保留10000 roots/10000ms；不可env/factory覆写。history真实流程按页/root/最终封口采样，到限throw、原事务rollback后另事务partial。它是安全判限而非OS硬内存上限，不涵盖MariaDB，查询/GC间峰值可能超过采样限；边界测试是纯函数数值fixture，不冒充真实内存压力测量。待最终闭包复跑。

最新安全入口开发离线30/30通过；新SQL `cVjlol` NO_GO停于主链校验，实例已停止/端口释放。根因合成脚本此前仅包装普通repo.claimSyncRun观察owner，新候选专属CAS不再经过该wrapper，脚本owner未赋值而严格contractOf拒绝；改为观察实际成功UPDATE的owner参数，不放宽业务claim或Journal。另落地reply自身external_id物理事务before/after断点及exactIntent新Node读回恢复：内容/任务/CP/jobs齐落地，after不重放已提交回复且保completed_epoch1。待复跑，不将新增用例标PASS。

历史规模修复后 `overseas-real-db-ywLzb4/result.json` 为17主项局部PASS，自有实例停止/13316释放。100/1000 roots分别约156ms/1393ms sealed；10000/10001均10秒预算后全rollback、history tasks=0、另事务partial（约10.13/10.12秒含不可抢占SQL/回滚，不能承诺硬10秒终止）。峰值Node RSS约102MB、heap约30.8MB，不含MariaDB且采样包含partial收尾；尚未固定内存限制。该运行启动于最新安全入口补丁前，不能当新CAS/canonical验证。安全入口与既有主链离线21/21通过；新增CAS三测待执行。QA消息已确认manual独立提测，但仍需完整新闭包冻结，当前不是整批QA完成。

经理消息明确允许分阶段提测：当前manual完整闭包与scheduled独立全链分开，最终海外范围不缩减；manual PASS不代表v104总体完成。安全入口员工建议经负责人审查落地：candidate每次读canonical源分类，拒caller伪domestic/其他platform绕路；初次claim只凭initialRunBindings做完整scope queued0/epoch0/attempt0单CAS，running/expired绝不采用普通claim；恢复repo只能由RecoveryFactory私有WeakMap匹配精确proof/Journal。source/账号/窗口读回再核，未知ACK无重试。普通非目标仍原依赖；待测试及真实SQL复验。

接续检查：`overseas-real-db-rZn0Hb/result.json` 保留 NO_GO 原始证据，前16项完成、历史规模准备报 ER_TRUNCATED_WRONG_VALUE；自有实例已停止、13316已释放、productionTouched=false。历史 synthetic run 的 window ISO 值此前直接传 DATETIME，改用既有严格 iso 校验后转数据库 UTC 字符串，仅修合成 fixture，不改变生产时间窗或成功门禁。待实测复跑；不会复用旧PASS冒充整批QA。

本文件创建：仅记录已批准范围与实施顺序，未实现业务功能或运行DB/HTTP。设计来源v104，经理待办v033保持经理唯一写入。

首项落地：新增纯任务身份模块 `worker/src/overseasStageTaskIdentity.js` 及4项测试。identity包含run/site/window，不包含owner/epoch；schema descriptors不可变，重复/跨board/敏感字段拒绝；页面业务post派生comments、回复root/sort校验，context/deleted排除。尚未接SQL账本或真实采集；测试待执行，不能当完成证据。

首项开发验证 `node --test worker/test/overseasStageTaskIdentity.test.js` 4/4 PASS。第二项新增 `isolatedSharedWorkerRuntime.js` 显式装配现有candidateFactory和单scan/drain生命周期；默认调用真实runOnce，但不装入生产main、无timer/signals/env activation。4项测试覆盖单scan、shutdown幂等/排空后关pool、scan失败清理、非目标原依赖及global fetch拒绝；待执行。scheduled合同和真实服务drain仍未完成。

只读进程核对：SCM Worker wrapper PID19960、Frontend wrapper7704、Api wrapper38336；实际服务身份LocalService。它们是wrapper，不是原生产Node基线；Node19584/19768及mysqld5900创建时间仍与候选16基线一致。没有服务动作，不把wrapper和child误当进程发生切换。

第二项首轮8测5通过/3失败：生命周期fixture使用伪Journal及缺getConnection，被真实dispatch构造门禁正确拒绝。修fixture为真实根.temp文件reader，意外SQL连接显式抛错，不放宽生产代码的品牌校验；待复跑。

生命周期fixture继续补必需getDefaultAccount（非目标调用一律抛错），最终两文件8/8 PASS。新增独立隔离状态目录策略：只允许真实根.temp内既有非link目录，私有品牌，复制policy和生产路径拒绝；不创建生产目录或写ACL，尚未接receipt/Journal/intent可选recheck，2项测试待跑。

新增三文件10/10开发离线PASS。下一项落地 `overseasStageCoverageSchema.js`（两表，未加入migrate入口、未执行DDL）、`overseasStageCoverage.js`：可信receipt/Journal合同、调用者同事务、完整预期集合count/hash、schema固定、任务descriptor不可变、CP精确snapshot、seal/terminal/readProgress。新增admission字段预留而manual不使用，不能当scheduled已支持。尚未接worker/PageStore/历史扫描，未测试SQL，不能冻结提测。

补真实历史扫描方法：具体Repository方法同物理连接RR扫描，不接任意load callback，累计scannedCount而非过滤后rows；10000roots/10000ms到限或gap/cursor异常throw要求外层rollback。sealHistory收为私有，仅读完末页才封口；Repository仅增加scannedCount返回字段不改SQL。单SQL执行不保证10秒内抢占，实际测量及语句时限仍待隔离验证。两SQL模块node --check exit0，未执行DDL。

PageStore/adapter/candidateFactory新增可选品牌coverage接线，页面callback在真实CP更新后、外层实际commit之前使用同物理conn登记派生任务。worker仅在启用coverage时传回复目标/父ID；普通链不激活。新增worker coverage facade管理RR事务、UNKNOWN destroy/只读进度，尚未接daily prepare/pending恢复/seal或audit，未执行整批测试。

daily接线完成首轮：schema后同快照历史prepare，恢复从持久pending调comments/reply，completed CP必须本run任务证据，lane排空后seal；局部22/22离线回归PASS（仅10新增+12既有mainchain，不覆盖新SQL）。新增BoundAudit模块首轮：可信Journal/ledger、精确run/epoch确定audit事件、原子terminal与unique links计数、只读reconcile；尚未worker接线/测试，partial早期无manifest故障收口及旧audit报告仍待补，不声称已完成。

首轮审查修复回复派生同conn根帖/一级父评论真实祖先与scope校验，历史完整row scope冲突拒绝；audit可选接线跳过提前普通createRun，Journal准备后创建品牌audit并重建finishOnce。相关16项既有mainchain/lifecycle回归PASS，新增绑定audit和账本未实际SQL测试。审查另发现activity feed在旧候选PageStore被拒、早期无manifest失败收口、回复归一前原值校验、旧audit报告/计数版本Progress尚未闭合，列为下一必修，不当整批PASS。

审查纠正activity判断：真实syncStagePage先normalize为post，故不是主链阻断，未改该业务规则。新增隔离installer两表+audit_events定义及额外新receipt ledger actual runSource子项；还未执行，自有13316仍按原identity/cleanup守卫。修复seal已提交而terminal前中断的幂等seal复验，旧证据保留。准备首次新合成SQL开发验证，不代表冻结QA。

首次合成SQL结果oorPm8为NO_GO：旧11主项通过，新ledger实际终态前段通过但测试沿用全库audits数量断言，在历史案例累积环境误报REAL_MAINCHAIN_AUDIT。自有实例已关闭/13316释放，原始result.json保留。修为精确target run terminal-event/auditId校验，并加真实账本sealed+全taskcompleted与只读audit reconcile核验；待复跑。新增规范/品牌15项离线PASS，不覆盖SQL事务矩阵。

新增scheduled专属纯admission身份模块及3测：严格parent/child/slot/version/window，不接manual恢复、不授claim/HTTP；暂未SQL持久/调度接线。生产readiness不能据此GO。补完成集合摘要进入audit事件，回复归一前原值严格验证。第二次新合成SQL正在执行，未收到结果前不报PASS。

第二次OyrC8f真实合成SQL12主项局部通过（含实际ledger/绑定audit），自有实例关闭/13316释放。新项只一站post1、pending分析/翻译各1、CP5；旧11矩阵未启用ledger，不能迁移为新ledger中断/评论矩阵PASS。新scheduled3测PASS仅纯身份合同。后续补audit精确事件/完成sealed/error对账与旧unbound report-only；整批新QA仍待完整矩阵。

新Progress增加显式requireStageCoverage通道：新epoch1完成必须真实账本sealed/完整任务和绑定audit版本accepted，然后按持久links含评论累计校验；旧默认合同不放宽。仍需新工厂强制接该通道，未验证新epoch1评论。BoundAudit允许无manifest且零links的早期失败原子收口（不是成功证据），Journal/audit创建失败则精确阻断保留running，不新造普通audit；已补reportUnboundRunning仅读报告。20项mainchain/规范/身份回归PASS，真实矩阵待新轮复验。

新增 `overseas-isolated-ledger-checks.js` 六项真实SQL事务fixture：漏task降partial、schema漂移保旧任务、audit更新失败全rollback再精确重试、真实commit后ACKloss destroy/只读accepted、seal重放幂等、旧无绑定audit report-only。每个fresh receipt/人工CP列表明确记录，不冒充真实采集；仅已核身份父实例可调用。尚未执行；评论/context与动态页中断不由人工CP fixture代替。

第三次b1gEMR为NO_GO：已有12主项通过，新增矩阵prepare被PREVIOUS_RUN_ACTIVE正确拒绝（前一单未使用站点仍queued）。自有实例关闭/端口释放，原证据保留。仅合成fixture按上一request显式runId将未使用queued/人工running结束为failed，不扫生产或以此当完成；修后待复跑。账本事务补固定3秒锁等待/10秒单语句时限，manifest/epoch/flag与origin枚举严格核验。

第四次 `overseas-real-db-fdkeC0/result.json` 为 `PASS_ISOLATED_REAL_SQL_PARTIAL`：13主项包含原11项、ledger实际runSource及六项人工CP事务矩阵。人工矩阵不证明评论/动态回复采集或中断恢复；旧11项也不迁移为新账本覆盖。自有实例已停止、13316已释放，productionTouched=false；此前失败证据保留。状态目录策略注入Journal与相关回归12/12通过，仅根.temp既有目录，不代表生产持久根/ACL可用。尚未冻结新候选或流转新QA。

员工主链建议经负责人审查落地：合成ledger场景增加严格ledgerComments开关（仅ledger=true），950根帖、951顶评、952内嵌回复、953动态补漏；真实Connector以commentCount2/inline1派生q1_reply，不重复返回父评论。增加同页origin、CP快照、祖先、四条唯一links/各队列和epoch1 audit计数断言。旧评论案例和旧证据不变，本轮尚待执行，不代表中断恢复已覆盖。共享入口只读审查发现旧bulk recoverExpiredRuns会改变海外epoch，scheduled/回退仍未闭合，继续NO_GO。

新增drain异常任务join测试，经负责人落地验证：`node --test worker/test/isolatedSharedWorkerRuntime.test.js` 5/5通过，证明admitted任务清理前不关闭pool，不代表Windows服务停止期限已验证。第五轮YNd5dM合成SQL为NO_GO：原11项通过，新ledger评论案例终态断言失败；自有实例停止/13316释放，失败证据保留。新增仅合成终态诊断输出（run/tasks/comment请求），准备定位实际失败原因，不放宽完成断言。

第六轮OnG06p诊断确认：新旧评论fixture使用同文案，在同source生成相同fingerprint被PageStore正确拒绝，实际终态partial且评论任务未完成。只修合成文案包含各自ID，不改业务fingerprint或冲突门禁。实例已停止/端口释放，待复跑；这不是上游生产缺陷证据。

候选共享bulk恢复保护落地：新增品牌handler绑定同repo，仅明确canonical非目标来源沿用旧3/600/50恢复规则，海外bigplayer/未知身份不由该SQL改epoch；普通buildDeps保留旧行为。新增4项纯SQL合同测试及默认真实runOnce空队列/drain测试待跑。此保护不代表海外expired queue claim、scheduled或回退已闭合，不授生产激活。

第七轮j7KVEC合成SQL局部PASS：14主项含新epoch1评论/内嵌回复/动态reply账本主链，唯一post1/comment1/reply2、links4、分析/翻译pending各4，task origin/CP/父链和绑定audit对账通过。自有DB停止/13316释放；未验证新ledger中断恢复。候选bulk保护、真实runOnce空queue、drain和既有mainchain离线组合22/22通过。新完整矩阵未冻结，未流转新QA。

原子source回写补丁落地：worker透传原有sourceStatus/sourceErrorMessage，BoundAudit只沿用success/failed旧口径且同conn再次live owner/epoch fenced更新，coverage降级partial禁止source success；terminal保存sourceEffect，只读对账复核（后续run改变source将unknown，不补写）。人工矩阵增加source更新故障全rollback/failed重试对账，以及audit故障/ACKunknown包含source快照。待验证，未改变生产配置或产品口径。

links归属闸门落地：同conn一次核验完整task集合，帖子每个membership必须有精确feed descriptor任务，评论/回复必须有同root评论任务或匹配父comment的reply任务；完成态只接受completed所属任务。links无producer task字段，因此只声明合法任务归属，不冒充唯一逐页来源证明。partial已有links也需有合法任务，零links早期failed保留。待真实SQL复验与tamper补测。

第八轮IQCXoN局部合成SQLPASS（运行启动于links补丁前，不能当links验证）：新增source故障整事务rollback、failed精确重试/只读accepted、source/audit共同ACKunknown均通过；实例停止/13316释放。补禁止失败态自称source success与完成带error，并新增实际ledger完成后membership删除/跨board、comments task降expected的同事务tamper测试，测试事务全部rollback，完成证据保持不变。待第九轮复跑。

同快照修复落地：BoundAudit抽出reconcileInTransaction要求已有事务，仅SELECT，Progress用原RR READ ONLY连接核验，不再另开audit连接混用快照；公共reconcile仍包装独立只读事务。partial links也拒failed/unsupported所属task。待开发验证，新factory严格上下文仍待补。

第九轮iTOaVG局部SQLPASS，links membership删除/跨board、comments task expected拒绝及rollback后auditaccepted已验证；实例停止/端口释放。同快照修复12/12旧mainchain离线PASS，尚需SQLProgress执行。新增严格stage-covered factory：coverage的repo/receipt/Journal与audit repo/Journal/ledger必须同组；first-claim loader启用新账本时走严格factory，Progress新显式入口不可关闭requireStageCoverage，旧plan不能带新账本继续。新增epoch1含四内容Progress实际SQL断言待复跑。recovery proxy严格装配另待补，不宣称整批完成。

严格factory补离线缺失/复制能力拒绝测试，合成主链加入repo/Journal/ledger拼接拒绝断言，待新轮验证；32/32既有mainchain+manualHandoff回归通过。git diff --check定向worker/repository无空白错误，仅CRLF转换提示。

第十轮NfdCQ7局部SQLPASS：严格factory实际ledger主链、同conn epoch1四内容Progress读取通过，实例停/13316释放。最后新增context复制拒绝断言在该进程启动后落地，不能移用本轮PASS，仍待下一轮。严格能力/bulk/drain离线16/16通过。

新增严格恢复factory：先校验原repo/receipt/Journal/ledger品牌上下文，再围绕精确recovery proxy重建ledger/coverage/audit，走严格factory；不放宽repo身份检查。旧恢复入口拒携带新ledger（必须走新入口），完整receipt request仍由ledger.evidence逐次核验。未验证新epoch主链，等待seal缝隙合成case。

seal-after合成子入口落地：固定合法case与960根帖派生961/962/963，实际seal事务commit后可暂停自有child；新epoch恢复走严格恢复factory/原receipt/Intent，不复用旧owner。终态/Progress核验使用精确新epoch，origin仍核验初次epoch1；恢复后禁止内容页HTTP与新增content/jobs。仅测试入口，父矩阵待接线与执行，生产不动。

父seal恢复矩阵已接线：核自有13316/serverId/datadir与根.temp，实际封口提交后只中断自有child，等自然lease过期，精确Intent→新Node epoch2，比较完整tasks/links前后不变并保留旧epoch audit running人工审查。动态回复字段区分本epoch执行与持久证据，未复用旧PASS。待执行；不执行生产/真实HTTP。

第十一轮Edr5xj局部SQLPASS：15主项新增seal实际commit后中断→精确Intent→新Node epoch2完成；持久tasks/links不变，内容页请求与新增content/jobs均0，旧epoch1 audit仍running，未自动补success。严格context复制拒绝/epoch1及epoch2同connProgress也通过；自有DB停/13316释放。comments/reply页提交前后中断、并发seal、规模预算和scheduled独立全链仍未测，不可冻结整批QA。

scheduled只读readiness候选落地：列能力inventory绑定repo私有品牌，无DDL/写SQL，即使必需列齐全也恒ready=false，明确admission/父子fence/首次claim恢复/账本终态/约束尚未证明；不替普通scheduler gate，不把列齐全当功能兼容。3项离线测试待跑，独立scheduled工程仍未完成。

scheduled身份/readiness6/6离线通过。候选assembly明确拒启普通unifiedScheduler enabled，route读取真实persisted trigger/parent并在adapter/claim前拒scheduled，不信caller伪manual；普通buildDeps/非目标早返回不改。新增assembly/实际runSource门禁2测待跑，不把失败关闭当scheduled完整实现。

候选scheduled门禁/identity/sourceRouter及主链28/28离线通过。待做独立scheduled工程路径已确定：slot txn一次登记parent/child/admitted manifest，独立admission品牌校验，不复用manual parentNULL；bootstrap后admitted epoch0→open epoch1，独立claim/恢复与父聚合终态；全请求/PageStore/terminal同conn fresh父子fence，最终隔离新版readiness再接调度。该段为实施拆分，不是完成证据或生产授权。

普通scheduler seam+identity、新readiness/admission/strict能力44/44离线回归通过，普通scheduler不迁移候选合同。开始第十二轮新SQL复跑以覆盖最新scheduled身份列加载/门禁与seal恢复；未收到结果前不复用第十一轮通过。

新增comments-before/comments-after固定970/980合成case，按实际INSERT external_id列定位顶评物理事务，在commit前/后暂停，非任意参数匹配；reply origin epoch分别2/1，终态新epoch2核验。仅子测试入口落地，父atomic状态/jobs不变断言待接线，未验证。

第十二轮77ojF6局部SQLPASS，仅当轮15主项与scheduled身份新列/门禁和seal恢复（不包含随后落地的comments新case），实例停/13316释放。父comments-before/after已接线：回滚页links1无reply task/内容，已提交页links3含pending reply且CP同存；自然lease→exactIntent新Node epoch2，顶评请求分别1/0、动态reply各1、原completed task与已提交job原行不变。待第十三轮验证。

第十三轮QT4SKh局部SQLPASS：16主项新增新账本comments-before/after两个真实页中断/新Node epoch2恢复用例。同页内容/CP/动态reply任务原子性、顶评分别重取1/0、动态reply各取1、既有completed task和job原行不变通过；自有DB停/13316释放，productionTouched=false。七个新模块相关离线30/30通过，定向diff --check无空白错误。仍缺reply自身页中断、并发seal、历史规模/内存测量、scheduled独立全链/安全回退及非目标真实SQL，不标整批完成、不转移旧矩阵通过。

drain intake/sourceRouter/bulk回归16/16通过。只读复审发现mutable unifiedScheduler引用可在assembly后改enabled，修候选持有独立冻结mode off副本，新增mutation测试待跑。另发现caller伪domestic早返回、海外expired普通claim仍是共享入口安全缺口，需候选专属canonical身份/拒绝未授权claim工程收口；生产继续NO_GO，不能用上述回归次数代替完整共享门禁。

scheduler独立冻结副本与既有mainchain20/20离线通过；生产child5900/19584/19768创建时间只读核对仍分别为10月8日10:00:19/10:02:27/10:02:25，未重启。下一项员工已派历史规模完整脚本和共享canonical/expired保护、非目标SQL检查，不将设计建议记成实现。

历史规模脚本落地：100/1000/10000/10001各独立合成source/account与历史run关联，200一批参数化fixture，不删旧scope；修员工建议重复全库主键为每scale唯一UUID前缀。真实ledger历史事务固定10000/10000ms不调高，记录SQL/RSS/heap/commit/rollback，超预算必须全history回滚再partial；10k失败如实留测量，不包装完整覆盖。RR枚举+FOR UPDATE重验证语义明确，不冒充全部快照读。尚未执行、内存上限仍待实测固定。
