# 海外多站进度与 epoch 恢复技术方案

Status: isolated-design / RUNTIME_NO_GO
Date: 2026-10-09
Owner: 开发负责人

沿用项目经理下一阶段派单与v092新合成13316实例边界；生产不动、无真实HTTP或第二生产消费者、旧证据保留。员工只读分析，负责人审核并唯一落地。当前manual每站独立run、parent_run_id为空，验收应称同receipt请求聚合，不可伪称已验证父任务行。

## 分层方案

1. Journal增加指定runId/epoch只读recover，复用非链接/单链接/大小/canonical/hash校验，严格核文件名对应的run/epoch。它只证明文件完整性，不授予claim/HTTP权限。
2. 新隔离ProgressRecovery验证真实receipt、accepted对账、完整scope/window/manifest。queued0无运行字段为first；成功终态必须无owner/lease/retry/error、started<=finished<=DB now并具同epoch旧Journal及checkpoint/关联/计数证据才跳过。全部成功显式allCompleted，不空绑定回退普通source。live owner、失败/partial/paused等不自动恢复。
3. 过期running只产生品牌化精确reclaim计划。专用隔离claim锁旧owner/epoch/attempt/status/window/scope，再精确CAS至旧epoch+1/attempt+1，不放宽generic claim，不从当前配置重算窗口。配置仅作漂移否决。
4. claim前发布不可变recovery-intent：receiptId、旧合同SHA及tuple、继承scope、预生成新owner、目标epoch。提交未知只读对账；目标tuple一致才能证明已提交，不能无证补Journal。live目标owner不任意接管；重启等待过期并核intent lineage再领取。缺intent的claim到Journal崩溃缝隙继续拒绝，不声称恢复已完成。
5. 隔离恢复终态保留PageStore持久累计计数，audit本轮增量单列；不能沿generic finish用本轮计数覆盖原累计。checkpoint保留cursor、等待原lease过期再claim，不reset。

## 真实合成验证矩阵

| 场景 | 必须结果 | 状态 |
|---|---|---|
| 两站实际完成、第一站完成后重启第二站 | 第一站内容/队列/checkpoint/hash不变；请求聚合计数正确 | 待做 |
| 全部completed重启 | allCompleted，零claim/HTTP/写入 | 待做 |
| 第二站claim+Journal后页前中断自有client | 过期后epoch2真实claim与Journal继承，完成actual runSource | 待做 |
| 页事务提交前/后中断自有client | rollback或读回真实cursor/关联/jobs，不重置/不重复 | 待做 |
| commit ACKunknown | 只读对账，不盲重插，不当作服务端断电证明 | 待做 |
| 新epoch后旧owner请求/写/renew/terminal | dispatch前拒绝；已发HTTP返回不能写，不能声称撤回已发请求 | 待做 |
| 两恢复client竞争、计划后tuple漂移 | 仅一个精确CAS胜者；旧计划不能跨epoch静默领取 | 待做 |
| claim前/后Journal发布前client中断 | durable intent核验或明确拒绝，不无证补造 | 待做 |
| Journal/receipt/config/checkpoint篡改 | 失败关闭 | 待做 |
| 同source两站相同externalId | 单列冲突拒绝；成功样本两站用不同ID | 待做 |
| 合成AI/translation消费 | 与真实模型调用区分；本项未消费 | 待做 |
| 新冻结独立QA | 原候选15保留；完整新manifest/原始结果 | 待做 |

真实上游、AI/译文、全入口独占、第二源精确缺口、下一调度槽及跨平台真实回归另列未完；本设计不授权生产。文件fsync与本机client中断不等于断电全矩阵。

## 首项变更记录

已落地Journal只读recover与四项测试，未接入自动恢复/claim，不改变原prepare epoch1门禁。其余模块未实施。验证结果另追加本文件。

开发验证：`node --test worker/test/overseasBigPlayerRunContractJournal.test.js worker/test/overseasBigPlayerMainChain.test.js worker/test/overseasManualHandoff.test.js`，39/39 PASS、exit0。新增测试覆盖指定epoch恢复不写文件、身份/遍历拒绝、合法envelope复制到其他run/epoch文件名拒绝、损坏canonical拒绝。此为开发侧局部测试，尚非独立QA或epoch恢复完成。

第二项已落地`overseasManualProgressRecovery.js`只读品牌plan：queued0剩余站点、成功站点Journal/checkpoint/关联计数证据、过期站点描述及allCompleted。恢复factory重读证据，只接剩余first权限；expired尚未接精确intent/CAS，一律拒绝执行。描述不等于reclaim许可。completed内容scope按现有证据严格校验；跨站相同externalId共享方案仍按v051后续闭合，不是永久产品拒绝规则。

第二项最小开发回归41/41 PASS。两脚本接入第二个新Node progress模式，目标第二站使用不同合成ID；实际读取第一站成功证据并保持其内容/队列不变，两站实际终态后allCompleted零claim/HTTP/写入。原双owner CAS移至独立第二请求；初次两站不再用人工terminal作为恢复完成。真实SQL待执行；intent/reclaim/累计恢复终态模块与安全client中断矩阵仍未实施。

两站开发真实SQL9/9 PASS，证据根.temp/overseas-real-db-thcuLb/result.json，自有实例关闭/端口释放。新增`overseasRecoveryIntent.js`以真实receipt/旧Journal校验、品牌plan创建不可变intent（wx/fsync/hardlink），next owner在claim前固定；新增`server/src/db/overseasRecoveryClaim.js`精确旧tuple事务CAS、UNKNOWN destroy及只读对账、保累计终态。尚未接入口/新epochJournal，未验收；缺Journal崩溃缝隙仍失败关闭，不能称已恢复。

员工复审要求加固：Journal真实reader品牌、完成checkpoint任务/数值与计数核验、第一站全run/checkpoint/content/jobs/关联/membership/Journal字节、allCompleted全部写SQL与DB状态比较。已落实首轮加固；成功epoch>1累计终态证据未闭合，当前progress成功判定显式拒epoch>1。评论任务祖先/feed成员证据仍需继续审查，9项旧结果不覆盖新加固，须重验。

加固后开发离线41/41及真实SQL9/9重验通过（qEyquI），allCompleted全写计数及两站关键记录一致。新增隔离RecoveryCandidateFactory及ClaimedContracts品牌intent通道：专用精确claim、实际新owner/epoch/attempt/live核验后写新Journal并再读验证；终态用专用保累计更新。未知页提交清理不调generic stale-cursor release，保留checkpoint等过期；正常checkpoint释放适配尚待完善。未覆盖claim→Journal崩溃自动恢复、epoch终态进度判定，未新冻结QA。

复审发现checkpoint no-op卡续页、评论持久累计遗漏，已补专用释放：同事务run owner/epoch/live fence，保留server cursor/items/last_item_at；专用terminal按真实唯一run-content关联计算跨epoch含评论的累计discovered/stored，不加本轮ACK不明增量。语义明确为恢复路径持久去重累计，与初次runSource观察增量区分。禁止同run混用初次和恢复许可。新修复待真实epoch/页矩阵验证，仍无整批PASS。

新增`overseas-isolated-reclaim-checks.js`：真初次claim+Journal、自然租约过期、durable intent同tuple幂等、真实双调用精确CAS仅一胜者、epoch2/新owner/旧Journal继承、旧owner network/page/renew/terminal拒绝。仅失败终态结束无内容测试任务，不算采集完成；该项不执行新Node actual runSource恢复、不模拟client中断，待真实矩阵后才能扩大结论。

精确reclaim开发SQL10/10通过（LXnmOj），这是自然过期非client中断。随后补新Node reclaim模式：epoch2自然过期后发布下一intent，由新Node actual runSource专用claim领取epoch3并执行合成transport入库/入队/终态读回；父脚本不再人工设置该任务失败终态。新增模式待执行；client真实中断与ACKunknown恢复仍未覆盖。

新Node reclaim两次失败（gwjFN4、wRilR5），均DAILY_RUN_TIMEOUT，自有实例已关闭。合成诊断显示ER_LOCK_WAIT_TIMEOUT且page实际INSERT为0：RecoveryFactory把`_upsertContentPageAttempt`绑定original repo，使PageStore `.call(facade)`丢失同连接事务并自锁。已保留此方法未绑定，以支持PageStore实际同conn facade；诊断仅合成路径/任务/错误代码，不含凭据或响应正文。修复待复跑，不能沿用旧PASS。

后续YlNS73/nJEZhL仍未通过，实例均正常关闭。进一步保留全部Repository方法动态this，防jobs调用脱离facade；新读回checkpoint按site+固定window限定，避免混入上一request的checkpoint。专用claim不匹配generic UPDATE计数，单列由真实epoch/owner读回与CAS矩阵证明。修复继续复跑，仍未完成整批。

继续修复请求run读回按确定性runIds限定（uM7iyD失败）、terminal观察兼容专用SQL空白（rbIBvV失败）。dni7hz真实SQL10项通过：自然expire精确epoch2及新Node actual runSource epoch3均执行；后者内容1/pending分析与翻译各1、checkpoint5。它不是client崩溃恢复证明；原失败结果保留。仍未覆盖epoch>1 completed的Progress重读、claim→Journal缺文件恢复、terminal未知只读对账、真实client断点和页cursor/队列中断矩阵，未新冻结/独立QA。现阶段生产仍RUNTIME_NO_GO。

下一加固：intent proof私有WeakMap绑定其receipt/Journal reader，factory/ClaimedContracts拒跨reader环境；新增专用terminal只读三态对账接口，核固定epoch/attempt/终态/清owner/关联累计计数，不自动回写audit/source，不因为文件存在猜DB commit。待补故障注入和独立测试。

派发闸首轮实现：候选factory独有ALS与品牌source合同能力，preflight绑定后source spread保留不可枚举于JSON的symbol。所有connector函数入口在候选内要求绑定；token exchange、详情、评论和内部重试使用同一wrapped transport。每次调用前读真实Journal，按PageStore顺序锁run/site/source/account，同conn重验不可变合同及live状态后立即调用transport，挂拒绝处理，再commit释放锁，不持锁等响应。调用后commit未知标记OVERSEAS_DISPATCH_COMMIT_UNKNOWN，绝不自动重发。可信合成transport合同是调用即开始派发，不证明socket发送时点或租约永不过期；已发响应仍依赖PageStore写fence。此首轮尚未测试，未冻结QA。

派发闸首轮回归38/41，3失败：healthCheck无显式account须复用绑定时已校验的账号上下文；离线模拟SQL需新增同conn持久核验响应并计入两次派发事务。已补品牌能力内冻结账号快照（不含credential），但每次仍核源及DB身份；此快照不授予跨scope权限。待重跑，不沿用旧41或真实SQL10项PASS。

派发闸回归最终41/41、新增7/7模拟测试PASS；同步纯能力/config helper不发网，保留原签名，所有异步/network入口仍要求品牌。独立MariaDB新aZPhCG真实合成10项局部PASS、自有实例已关闭13316释放；该轮包含新派发事务但尚无dispatch真实SQL竞态。继而接入真实SQL旧owner挂起准备后零transport、已发延迟response页事务fence拒绝；connector/session保留OVERSEAS_DISPATCH/NETWORK_CONTRACT错误码，避免UNKNOWN被误化普通网络错误。增加recoveryClaim专用SQL计数，实际epoch3要求恰好一次精确claim，不再仅豁免generic claim=0。新增竞态与计数待复跑；client中断/完整lineage仍未完。

真实SQL竞态与精确claim计数hObVFE通过：旧owner挂起后实际transport零调用、已派发响应页事务拒写、新Nodeepoch3专用claim=1。员工复审后加固合同封闭集合（run/owner/epoch独立）、外域/非API路径拒绝、detail fallback保留安全错误码。新增实际adapter四路径测试，dispatch文件12/12 PASS，含token exchange/detail/comments/重试标志入口，不声称覆盖实际auth refresh授权重试。当前又新增显式intent完整lineage校验，epoch>1成功必须逐级证明至epoch1，并核持久唯一关联累计；未验完整评论/feed覆盖，不把已登记任务完成视完整board不漏任务。新lineage及最新dispatch整批待复验。

新增JournalRepair独立隔离模块：仅显式intentId/完整旧lineage、当前精确next tuple已经过期、同connrun/site/source/account锁下无配置漂移，才能按intent原scope发布缺失Journal。已存在精确证据仅返回alreadyPresent；损坏不覆盖；初次epoch1无intent缝隙不支持。该函数零业务SQL写/claim/HTTP；不接管live owner。persisted verifier默认live不变，仅该补证据入口显式expired，返回完整性非网络许可。模块及client真实中断验证待完成。

DhTdln真实SQL10项局部PASS，含epoch3完成后完整lineage重读；自有实例关闭端口释放。新增专用隔离claim-client脚本，验证13316/serverId/datadir/PID后精确claim3，发出提交完成但未publish标记；父脚本仅中断其自有client PID，DB不杀。缺Journal3显式intent修复，再真实新Nodeclaim4采集/终态/lineage重读。该场景待跑，不替代页前/后中断、终态ACKunknown及全feed/comments矩阵。

6BNJVj真实SQL10项局部PASS，实际自有client中断位于claim3已提交Journal未发布，新Nodeclaim4采集/入队/终态/完整lineage通过；DB未中断、生产三个PID/starttime保持基线，13316已释放。补live修复拒绝（仅时钟仍live时适用，不能计作无条件矩阵）、repair重复不新增文件、缺一跳lineage拒绝检查待复验。当前仍未冻结候选16，不流转完整QA；页提交前/后client断点、terminal ACKunknown、评论/feed完整证据与真实授权重试单列未完成。

员工复审确认expired入口只补Journal不授网络、完整lineage品牌有效；补最终JOIN FOR UPDATE锁games/community等配置行，scope漂移与claim夺owner均在最终核验到dispatch调用内受锁保护，死锁失败关闭。claim-client增加准确realpath/根.temp非link/user/连接上限及spawn error/有界exit清理。57项离线回归此前PASS，新锁与client加固待重验。评论祖先raw scope/feed membership/完整stage集合仍未闭合，当前post1/comment0合成结果绝不扩大为评论补漏全链放行。

最新加固57/57离线与WD3Vbp真实SQL10项局部重验PASS、自有DB退出13316释放，含缺lineage拒绝、repair幂等。新增独立余站终态ACK-loss fixture：实际claim1/Journal/过期intent/claim2后由finishRecoveryRun真实commit再丢ACK，销毁连接，仅reconcileRecoveryTerminal只读accepted，audit/source/checkpoint前后完全一致。该fixture零内容计数、非actual runSource终态崩溃，也不是采集完成证明；待执行。全部未完项保持待办，不做候选16冻结。

E0Gzaw真实SQL局部10项PASS新增terminal ACKloss只读accepted及其他状态不变；自有DB正常退出。现新增独立新请求单页before/after实际PageStore外层commit中断脚本，只有INSERT po_contents的真连接commit触发marker，父仅kill自有child；before回滚/after持久读回，再pollrun和checkpoint真实过期、新Nodeclaim2恢复。after要求content/jobs完全不变，terminal持久1但本轮audit0；原client audit仍running明确为遗留，不人工改success。每个场景剩余未用站点明确failed SQL fixture收尾不是采集完成。单页完成不证明多页cursor续跑。模块尚未执行。

p5jAWB真实SQL11项局部PASS，页before/after自有client中断与newNodeclaim2实际恢复成功，after content/analysis/translation SQL为0且持久值不变，terminal累计1。补v2合法board API允许（原仅v1误入fallback），board fallback不得吞安全错误；Progress补评论任务精确键、祖先raw scope/root一致、last_item_at窗口以及post feed membership/对应checkpoint证据。最新加固待复验，仍无完整stage集合，不宣称全board覆盖；两页cursor、多feed重观察和评论真实合成矩阵待完成。

znfgFJ真实SQL11项局部重验PASS，44项派发/mainchain/receipt离线PASS。新增two-page合成场景：第一页903 hasMore=true使用真实connector生成cursor，actual commit后中断client，恢复只允许merged offset1采904；终态累计2、本轮audit1、jobs/关联各2、第一页content/jobs不变。该接线待执行；不手造cursor，不resetcheckpoint，不等同多feed/评论完成。

员工复审补comments checkpoint root真实同scope post验证、q1_reply数据库scope/depth/deleted一致；before中断补jobs/membership零读回及checkpoint items0/cursorNULL。after关联/membership与completed checkpoint完整快照仍需补，当前不得报全矩阵完成。

H3p4b6真实SQL11项局部PASS，新增two-page actual cursor offset1续跑、903不重写、904新增一次、unique累计2/pending jobs各2/恢复audit1；未杀DB、实例已关闭13316释放。最新57/57离线PASS。补after已提交checkpoint完整记录、首篇association与membership不变快照；two-page checkpoint允许真实推进，但首篇关联/membership不得重置。此快照加固待复验。

1NHcvF加固快照真实SQL11项PASS。新增comments合成页后中断场景：恢复后post905在三个feed重观察，唯一posts关联1、membership3，comment906/reply907祖先实际PageStore同事务验证入库及待处理队列；预期持久累计3而本轮stored2、posts checkpoint观察3。该新增待跑，不把真实HTTP/模型消费/完整board无漏集合等同合成覆盖。

as9HUM真实SQL11项局部PASS，评论906/reply907真实入库、三feed重复观察唯一关联累计3/帖子fetched1/membership3，恢复本轮2，生产无操作。新增每场景epoch2 completed完整lineage重读，以及comments祖先/成员board/任务键SQL篡改否决（仅合成行、验证后恢复原值）；待复验。

7KsPmE新增否决矩阵运行失败：自有page client退出5秒超时，不是业务PASS；DB仍owned SHUTDOWN成功13316释放，原结果保留。child等待增加明确exit状态与15秒有界退出，超时仍只重试当前spawn handle.kill，不按全局PID搜索杀进程。修复后需复跑，未冻结。

1StTEe修复后真实SQL11项及子矩阵PASS，comments祖先/membership/task篡改拒绝与全部页场景epoch2完整lineage重读通过，自有实例停、生产基线连续。员工最终只读复审无阻止隔离提测安全项，但保留epoch1评论保守拒绝、terminal accepted不代表业务完成等限制。已新冻结候选16 658文件、17测试文件144/144 PASS，旧候选15不动；v102清单/v103交接列全已测未测。冻结快照SQL正在复跑，未发送QA放行声明。

冻结快照lasBdq真实SQL11主项和已测子矩阵PASS、exit0、owned DB停机端口释放。正式交接v103已补原始结果路径；下一步真实消息流转QA及项目经理登记待独立测试，绝不升级为生产GO。

复审单列安全未完：connector/session凭据或token等待后，实际transport派发边界须再校验精确Journal+DB owner/epoch/live，包含token exchange；旧owner verifier拒绝测试并非真实dispatch竞态证明。现有`__recordHttpRequest`有owner/epoch/live SQL，但还需验证全请求入口覆盖及合同绑定，不据此宣称全入口独占已完成。当前无新冻结QA放行，10项仍只是隔离局部结果。
