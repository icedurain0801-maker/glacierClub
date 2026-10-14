---
last_updated: 2026-10-10
status: review-only-execution-prerequisites-incomplete
owner: 开发负责人
production: HOLD
---

# v078 精确切换与回退计划

v078 已获独立隔离部分 PASS；本文件交付四服务、双任务及已定位人工入口的切换方案，不执行生产操作。**境外 BigPlayer 定时同步尚未恢复验收。** 现役后端 loaded 字节均 UNKNOWN，translation 原安装包 ACL 拒读；服务 Running、入口路径、磁盘 SHA 和隔离 require.cache 不能替代现役 loaded 证据。

本次只准备工件，不重跑 v069/v072/v075 或三站，不实现通知或 schema，不执行服务/任务/ACL/DDL/真实采集/AI/通知/生产数据操作。正式待办由经理维护，本表仅记录交付边界。

| 交付 | 状态 |
|---|---|
| v078 冻结候选及独立 QA 证据核收 | 完成，5 个唯一组隔离部分 PASS |
| 精确服务、任务、人工入口及候选映射 | 完成，使用既有只读采样 |
| 切换顺序、双 gate、停止条件及回退策略 | 本文件已交付核收 |
| 可执行的准入暂停、禁止再起及双 gate 交接控制器 | 未实现；本文件无 executor |
| 原 XML 原字节与完整旧运行包回退归档 | 尚未制作；translation 拒读保留 |
| 新进程 loaded 证明及常驻 main / 真实 CLI 验收 | 未完成 |
| 通知、生产 schema/config/精确数据名单 | 后续独立范围，未扩项 |
| 生产切换和境内外真实定时验收 | 未执行 |

## 冻结引用和证据范围

完整候选在仓库根 `.temp/risk-normalization-20261010/candidate-writer-coverage-v078/manifest.json`，SHA `64c030e83c911f6af46fb33baf662825de0ab169c2cc4a077afac0c804051f6e`。五树 API401、collection413、analysis413、overseas412、translation413，共2052文件；24包内变化，另有1独立脚本、3份既有隔离schema。完整manifest原字节保留冻结时的pending文字；后续独立签收记录于正式v078索引，不改候选。

独立报告 `.tests/2026-10/2026-10-10/v063_writer_coverage_independent_qa.md` SHA `9e2c7b6f178b6c2134bae2dc294f827dbb434026e72e21b27b2656ae04015fc4`，汇总仓库根 `.temp/qa-v063-writers-summary.json` SHA `6d8ff91b7d74ee7aac7c1b52eaad88a58c51fa9ee576326e6a2e36f0cfde874d`。99次旧方法拒绝无DB/provider访问；实际API内存请求、shared入队、分析/翻译worker fake provider、真实SQL事务与撤权直接验收通过。5个唯一组来自多个保留原件，不是单轮5/5。最后成功轮606条require.cache只证该隔离轮3/4/5。

独立scriptOverlay仅VM验证三个导出写方法提前拒绝，**安装后CLI main、真实Q1 cmd和常驻服务main未验**。候选公共方法保护不覆盖任意raw SQL/恶意JS，运行清单也不是整机所有writer零遗漏证明。

原始只读采样：仓库根 `.temp/risk-normalization-20261010/employee-writer-identity-v077/manifest.json` SHA `eca9cb52fd2460d01d7223a177828a3db45b6b0a37e74fd64e01a254b68ab34c`。进程采样UTC `2026-10-10T08:57:52.9237894Z`，source扫描UTC `2026-10-10T09:00:37.436Z`。`runtime-identity.json` 保留PID/createTime/commandSHA/XMLSHA/Action，`source-discovery.json` 保留实际磁盘路径SHA和静态链；无生产内存或数据库观察。本文件不把约17:00的采样写成现在仍不变。

员工草案及manifest冻结于仓库根 `.temp/risk-normalization-20261010/employee-writer-cutover-plan-v081/`，manifest SHA `daa1a0add8ed6797ef5304caf4695b91e22a57c430bdc0f02f3cf0ecf347ff9a`。正式收口纠正其旧前端PID，并补正式QA边界；不修改员工原件。机器核收索引见 `v082_writer_cutover_control_manifest.json`。

## 精确对象及影响

下列PID均为Node/服务wrapper，创建时间为Node UTC。XML在 `C:/ProgramData/PublicOpinion/services/<服务名>.xml`，每项SHA及commandSHA见v082。

| 对象 | 基线PID与创建时间 | 实际入口 | 操作核收类别 |
|---|---|---|---|
| PublicOpinionApi | 5216/38336；2026-10-09T02:08:17.2499300Z | `C:/ProgramData/PublicOpinion/releases/v019-read-compat-vgfxk2/server/src/app.js` | 切至完整runtime-api；API入队属于writer。切换有短暂API维护窗口 |
| PublicOpinionWorker | 38428/16020；2026-10-10T04:07:16.6270650Z | `C:/ProgramData/PublicOpinion/releases/worker-release-v055-overseas-exclusion-1791605078003/worker/src/worker.js` | 切至runtime-collection，保境内采集、海外排除和enqueueOnly；维护窗口短停后恢复 |
| PublicOpinionAnalysisWorker | 20352/20272；2026-10-08T02:02:23.7169650Z | `C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1/worker/src/analysisWorker.js` | 切至runtime-analysis；指定唯一分析消费者，旧split包禁止自动再起 |
| PublicOpinionTranslationWorker | 20056/14372；2026-10-08T02:02:26.7650060Z | `C:/ProgramData/PublicOpinion/releases/translation-release-p0-20260918144000/worker/src/translationWorker.js` | 切至runtime-translation；旧包ACL拒读，回退归档待核，不能跳过此服务 |
| BigPlayer Q1 Daily 02（TaskPath `\`） | Ready/Enabled；采样未见Q1 Node | `cmd.exe`先cd到bigPlayer，再调 `public-opinion-system/worker/q1-daily.cmd` | 旧任务禁止再触发，实际工作树manual入口另控；五包升级不能覆盖它 |
| BigPlayer Last Night Overseas Daily 02（TaskPath `\`） | Ready/Enabled；采样未见daily Node | `C:/ProgramData/PublicOpinion/overseas-daily/releases/overseas-daily-release-handoff-1791605997752/worker/last-night-overseas-daily.cmd` | 先禁新触发，Action切至完整runtime-overseas对应cmd，受控验收后恢复 |

两任务采样NextRunTime均 `2026-10-11T02:00:00+08:00`，执行前须复核；Q1 LastTaskResult=3、overseas=0仅为观测，不能据此认定根因或成功同步。Q1 XML SHA `5ff1072dda88d24d18aae992a1c4fb50323b52ebbd8261971f215b9affc95e28`，overseas XML SHA `df2871141595af8eb11068d6802af231b4e3d10e19c51694b3f522f637cb3424`。

候选部署目标仅作拟定路径：`C:/ProgramData/PublicOpinion/releases/v078-writer-coverage-20261010/<runtime-name>/`，尚未创建、复制或启用。实际核收时若目标已存在或内容不符，停止，不覆盖旧目录、不自动改名追随。海外Action还须保留实际cmd的工作目录与参数语义，不能只替换JS路径。

## 五包之外必须控制的入口

以下“项目”指 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/bigPlayer/public-opinion-system`。

| 精确入口 | 基线SHA / 核收动作 |
|---|---|
| 项目 `worker/q1-daily.cmd` | `8d787151197ac9c9c5426368d16117eb06734caa4657062c90f62bab9187ae12`；保存原cmd/Action；Disabled仅禁调度 |
| 项目 `worker/src/q1DailyJob.js` | `159acdfa737c2814224e786a5801e2114f5daff1682fb6dc40edbc2df624611a`；禁止旧manual调用，不覆盖用户dirty |
| 项目 `worker/src/q1DailyAnalysisRunner.js` | `0584dd90cb0e6d56ab6e1585cfc67928df71baaaa0917ea472661281d6ba958a`；run/runScoped/processBatch/enqueueMissing旧split路径须控 |
| 项目 `worker/src/dailyRunner.js` | `b9fcf8ced9deecdbfa9aa61fa98e21f656a93a4f4e6812cec2428bf85ff25784`；禁止另起pump，包括候选analysis内安全但额外的daily实例 |
| 项目 `scripts/overseas-verify-exact-ai.js` | 原 `7063a9bd6065879c7ee2e564eac9ee9b79543145555b7ca5adff67a152ff12af`；独立候选blocker `9c2ebe0825afc5576b8997a58692e3e8882d0f2b66b22fd6c86ac76912340dc6`。单独核收实际替换或禁止执行，未验安装CLI main |
| 已定位旧安装包内Q1/dailyRunner/manual translation入口 | 逐路径沿source-discovery/v082限定；旧目录归档保留，不运行，不自动恢复服务/任务 |

冻结清单和Disabled不是不可绕过的OS屏障；未见进程也不证明未来不会再起。若需技术阻断，须准备实际blocker/入口白名单工件与验证，不能用口头约定冒充完成。本轮不改ACL、不删目录、不覆盖工作树。保留 `scripts/overseas-exact-ai-readonly.js` 只读用途，不把它当写脚本封禁。

## 双gate与生产者排空顺序

以下均为待核收操作描述，**不是当前已执行命令**。

| 阶段 | 顺序和放行证据 | 失败处理 |
|---|---|---|
| 0 前提 | QA部分PASS已核；通知及生产schema/config/精确名单沿后续范围收口；准入/禁止再起/交接控制器须实际存在并验收 | 缺一保持HOLD，禁先启动后补证据 |
| 1 身份与备份 | 重新核四wrapper+child PID/createTime/commandSHA/XMLSHA、双任务Action/XML与人工进程；保存原XML原字节、完整旧包逐文件归档及新包SHA。配置凭据不输出 | 漂移、多child、未知writer或归档不全即停并重核收，不能追着新PID操作 |
| 2 禁新触发 | 禁双任务和旧manual再起；当前任务及其cmd/node/python子树有界排空 | 不kill未核身份进程，不把当前无Node当永久证明 |
| 3 生产者准入 | 关闭API写请求及shared新采集准入，等待已接受请求/页事务结束；记录维护窗口和排空证据 | 没有通用write pause开关；须核实际维护手段，不能凭Stop-Service假证页事务完成 |
| 4 双gate | 同一固定DB连接按 `po-analysis-consumer`→`po-translation-consumer` 持GET_LOCK；每锁等待≤60s，核 `IS_USED_LOCK(name)=CONNECTION_ID()` 并持续复核连接存活 | 第二锁失败释放第一锁，保持准入关闭；连接丢失立即停止，不把evidenceId当持锁 |
| 5 排空旧实例 | 核旧provider状态/active owner，有界停四旧服务，确认旧child和任务/manual子树消失且不自动再起，双gate仍由控制连接持有 | gate只涵盖守该锁的轮次；ungated API/shared/脚本须另证排空。超时/重启/provider未知停止，不重置active/lease |
| 6 换指向 | 按精确核收目标改四XML entry/workingdir及overseas Action；完整候选核SHA，不覆盖旧包，两任务仍Disabled | 原件或translation归档缺口未解决则止步；生产schema不在本步骤运行 |
| 7 新包核验 | 新API/shared准入仍关；新consumers启动/暂停/双gate交接按已验控制器执行；核唯一新PID、包与实际加载证据 | 入口/Running/磁盘SHA不足以签loaded。当前无启动receipt/暂停控制器，不可按本文直接起常驻main |
| 8 最小受控验收 | 后续批准的精确样本、时间窗和调用上限；先验证事务/当前结果，再验证境内producer和指定海外任务一次触发 | 结果不确定、COMMIT_UNKNOWN、指纹/租约冲突停止，不盲目二次AI调用/重新入队 |
| 9 恢复调度 | 按验收恢复API/shared准入与海外任务Enabled；旧Q1保持Disabled，直到另有已验安全路径 | 未取得实际入库/分析/翻译和境内回归证据，不宣布恢复 |

双gate不是生产者暂停，也不是结果版本fence。两个消费者与API/shared旧生产者可同时存在，单AnalysisWorker控制脚本不足以全量切换。员工原 `employee-control/analysis-service-control.cjs` 默认旧manifest且不控translation/海外/Q1，禁止直接改参数套用。

配置intent默认disabled；安全enqueue并非随intent开关关闭，不能靠disabled恢复旧split。分析配置必须保源码既有基准manifest SHA、profile/version、证据ID和精确scope；翻译还需board/site/feed/language/时间窗。最终v078包SHA不能替换协议内的既有基准SHA。启用依赖3份既有schema内6表的生产核收及精确名单，不在此文执行。证据ID只是配置标识，不是批准、排空或锁所有权证明。

## 回退工件和保护对象

执行前必须保存四原XML原字节与wrapper配置、两任务原XML/Action/Enabled、旧完整runtime逐文件SHA/归档、人工入口原件、新manifest和本次新PID/创建时间。当前只有既有只读SHA/静态链，不宣称完整可执行回退包已制作。translation拒读不改ACL、不拿其他包代替；由获准身份只读归档，或明确核收停止且不恢复旧consumer的策略后方可执行。

候选启动前失败：保持双任务禁止再触发、manual禁止再起，旧split analysis/translation不自动恢复。API/shared旧读取/境内producer是否可恢复需按阶段与新ledger状态核收，不能RestoreAll重开旧writer。

候选启动后失败：关准入、有界排空新consumers，核新PID再停；保存intent/audit/repair/已提交结果。可恢复原XML原字节，但旧split consumers仍Stopped、Q1仍Disabled。DDL不可普通事务回滚，不DROP表、不恢复全库旧快照、不清lease、不删ledger；COMMIT_UNKNOWN交精确审计对账。

Frontend3001、LoginSession为非本次操作对象。员工约17:00采样中的旧前端PID19768已经过时；**以v080实际发布核收为准**：Frontend3001 Node47928/wrapper23200，UTC `2026-10-10T09:11:40.7277340Z`，实际 `C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261010-source-draft-v211/frontend3001-server.js`。来源v065两静态文件及鉴权保持，执行前保护身份仍须复核，漂移即停。LoginSession基线19468/19896、UTC `2026-10-08T02:02:25.9819750Z`。未证明它们全库零写，仅写明不操作。

## 最小线上验收定义（未执行）

不重三站全量。后续核收时填写确定的source/account/game/community/board/feed/时间窗、content/job ID、版本、允许一次provider调用及费用范围，禁止通配或全库回填。

1. 新进程唯一、实际包和loaded证据一致；旧Q1/manual/旧split不再起，原件和回退可用。
2. 指定境内来源一次采集，实际有效新增/更新入库且安全入队；鉴权/查询正常。不能把API 200当入库成功。
3. 指定海外任务一次：cmd/Action/实际run关联、正确board/feed与本地/UTC窗口、正文及双intent页事务一致，当前分析/译文结果匹配。退出0/触发次数不代替数据同步成功。
4. 旧晚回包不能覆盖当前版本，结果/缓存/job/audit一致，真实通知保持后续已核收抑制；不增加额外故障注入或重复付费调用。
5. 下一次实际定时运行再核同一链条；采样NextRunTime已过去或变化时按实际时间重核，禁止用旧时间签收。

当前可收口的是隔离旧writer覆盖部分PASS和本核收计划。生产执行器、真实调度恢复及境内回归仍未完成，交经理继续安排，不解除HOLD。
