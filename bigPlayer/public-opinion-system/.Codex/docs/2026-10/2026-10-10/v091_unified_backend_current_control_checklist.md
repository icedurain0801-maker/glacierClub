---
last_updated: 2026-10-10
status: readonly-refresh-blocked-identity-drift-no-controls-effective
owner: 开发负责人
production: HOLD
---

# 统一候选 v089 的最新执行前控制清单

本轮只读/离线刷新，**没有实施任何切换、暂停、排空、持锁或禁止再起**。v089 已独立组合部分 PASS，但当前 API 与前端于北京时间18:06再次变更，v089不能直接覆盖当前API。保当前 `sync-auth-persistence-fix` 和前端v214，不回退到 `login-auth-fix` 或v211；不归因新发布来源，不改v089冻结字节。境外定时同步尚未恢复验收。

## 最新证据与失效范围

只读前采样北京时间 **2026-10-10 18:09:27**，后采样 **2026-10-10 18:09:31**。6服务及唯一直属Node、3任务关键配置两次稳定；这是数秒观测，不保证未来切换窗口仍相同。原件位于仓库根 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/control-refresh-v091`，正式完整机器清单为同目录文档对应的 `v092_unified_backend_control_manifest.json`。

v089完整manifest仍为 `99ace6cc9c3c040aa8eab3d548e002a7fc9a74503a19aed910feb5ca2fc35cc2`，2052文件，script1/schema3，本轮仅身份核对，未重测试。API源v087保旧login-auth-fix，四树源v078；独立组合报告v065只签当时冻结候选。

当前API Node22680/wrapper16720，创建 `2026-10-10T10:06:23.0642690Z`（北京18:06:23），XML SHA `f52da6ae894f8f3793e26e26b5eacf1d1c22d60f6aae07eec34a2e3d0c28ffce`；新release `C:\ProgramData\PublicOpinion\releases\release-20261010-sync-auth-persistence-fix`。当前396文件可读，与原396基底相同字节391个，变化路径：`package-release-manifest.json`, `server/src/app.js`, `server/src/connectors/bigPlayerH5Connector.js`, `server/src/db/repository.js`, `server/src/services/credentialContext.js`。这是磁盘差异清单，不签重新集成或业务兼容；新API完整归档尚未制作。

v081/v082旧API目标、v083旧login-auth-fix实际身份及v089直接API拟目标均不得执行；保历史原件不覆盖。v089已验源码身份不作废，**它对当前生产API的适用性阻断**。必须先新API归档/差异/必要再集成与独立核收，生成另一个revision；本轮不做该开发项。离线控制器r3仍绑定旧输入，没有实际adapter，不自动换PID/改目标绕过阻断。

## 四服务、四运行树与海外任务树

PID为Node/wrapper，创建时间为Node UTC；全部四服务现采样 Running/Auto。XML完整路径/SHA、wrapper commandSHA、唯一Node父关系/createTime/commandSHA、实际workingdirectory及candidate入口SHA均列v092，命令其余参数和环境值不回显。

| 服务 | 当前PID和创建时间 | 当前实际入口 | v089候选映射 | 归档/回退状态 |
|---|---|---|---|---|
| PublicOpinionApi | 22680/16720；2026-10-10T10:06:23.0642690Z | `C:\ProgramData\PublicOpinion\releases\release-20261010-sync-auth-persistence-fix\server\src\app.js` | `api`，401文件 | 新基底396可读，尚未完整归档 |
| PublicOpinionWorker | 38428/16020；2026-10-10T04:07:16.6270650Z | `C:\ProgramData\PublicOpinion\releases\worker-release-v055-overseas-exclusion-1791605078003\worker\src\worker.js` | `collection`，413文件 | 原归档408文件仍匹配 |
| PublicOpinionAnalysisWorker | 20352/20272；2026-10-08T02:02:23.7169650Z | `C:\ProgramData\PublicOpinion\releases\worker-release-taptap-20260921-v055-formal1\worker\src\analysisWorker.js` | `analysis`，413文件 | 原归档408文件仍匹配 |
| PublicOpinionTranslationWorker | 20056/14372；2026-10-08T02:02:26.7650060Z | `C:\ProgramData\PublicOpinion\releases\translation-release-p0-20260918144000\worker\src\translationWorker.js` | `translation`，413文件 | 406枚举/0可读，回退不完整 |

`runtime-overseas` 为第五树，412文件，对应下述海外任务，不是第五Windows服务。现役海外daily release405文件可读；本轮只做磁盘身份清单，未制作完整回退ZIP，不签现役loaded或cmd main。

旧API/shared、analysis、translation和脚本都有writer边界；双consumer gate不能替代API/shared准入关闭，也不能覆盖不守锁的旧脚本。四XML指向变化有维护影响，未来窗口须单独核收；本轮零变更。

## 双任务与包外manual/script

| TaskPath / TaskName | 当前状态 | 上次观测 | 下次观测 | 未来控制 |
|---|---|---|---|---|
| `\` / BigPlayer Q1 Daily 02 | Ready / Enabled=True | 2026-10-10T02:00:00.0000000+08:00；result=3 | 2026-10-11T02:00:00.0000000+08:00 | 旧Q1禁触发并保持禁，另控manual；未执行 |
| `\` / BigPlayer Last Night Overseas Daily 02 | Ready / Enabled=True | 2026-10-10T12:20:20.0000000+08:00；result=0 | 2026-10-11T02:00:00.0000000+08:00 | 禁触发/排空/重指向后经真实验收再恢复；未执行 |

Q1 Action仍cmd先cd工作区bigPlayer，再执行 `C:\Users\Administrator\AppData\Roaming\Code\User\project manage\bigPlayer\public-opinion-system\worker\q1-daily.cmd`；其实际JS仍工作区 `worker/src/q1DailyJob.js`，不是v089候选。任务Disabled只能禁调度，不能防manual调用。海外Action仍旧 `C:\ProgramData\PublicOpinion\overseas-daily\releases\overseas-daily-release-handoff-1791605997752\worker\last-night-overseas-daily.cmd`，execute/参数SHA/workingdir及XMLSHA在v092，未来重指向必须保cmd工作目录与参数语义。LastTaskResult=3/0不作为根因或同步成功证据；未来窗口重核NextRunTime，不按旧时间执行。

`BigPlayer Keep Server Alive`现为Disabled/Enabled=false，旁观保护，未操作；没有凭此宣称所有再起来源被阻断。当前采样未见独立Q1/daily/exact人工Node，但不证明任意动态writer零遗漏或未来不再起。

以下13精确已定位旧入口本轮重新核磁盘SHA，全部与旧观察一致；保文件不删、不覆盖dirty工作区。技术blocker/允许入口名单尚未实现。每个候选包的额外Q1/daily/translation路径在v092另列，特别是analysis安全dailyRunner也不能另起额外consumer实例。

| 实际旧路径 | 当前磁盘SHA | 状态 |
|---|---|---|
| `C:\ProgramData\PublicOpinion\releases\worker-release-v055-overseas-exclusion-1791605078003\worker\src\dailyRunner.js` | `b9fcf8ced9deecdbfa9aa61fa98e21f656a93a4f4e6812cec2428bf85ff25784` | 与前采样一致；未技术阻断 |
| `C:\ProgramData\PublicOpinion\releases\worker-release-v055-overseas-exclusion-1791605078003\worker\src\q1DailyAnalysisRunner.js` | `5cc1b6461cad525674837af7f3c0dbcbf63be8304383143dc89971e44ef952cc` | 与前采样一致；未技术阻断 |
| `C:\ProgramData\PublicOpinion\releases\worker-release-v055-overseas-exclusion-1791605078003\worker\src\q1DailyJob.js` | `159acdfa737c2814224e786a5801e2114f5daff1682fb6dc40edbc2df624611a` | 与前采样一致；未技术阻断 |
| `C:\ProgramData\PublicOpinion\releases\worker-release-v055-overseas-exclusion-1791605078003\worker\src\translationWorker.js` | `7d5b859bfb0fee118db4c271ce536008c983115ef150e0d8f4b0ffd1ebdf1b59` | 与前采样一致；未技术阻断 |
| `C:\ProgramData\PublicOpinion\releases\worker-release-taptap-20260921-v055-formal1\worker\src\dailyRunner.js` | `b9fcf8ced9deecdbfa9aa61fa98e21f656a93a4f4e6812cec2428bf85ff25784` | 与前采样一致；未技术阻断 |
| `C:\ProgramData\PublicOpinion\releases\worker-release-taptap-20260921-v055-formal1\worker\src\q1DailyAnalysisRunner.js` | `5cc1b6461cad525674837af7f3c0dbcbf63be8304383143dc89971e44ef952cc` | 与前采样一致；未技术阻断 |
| `C:\ProgramData\PublicOpinion\releases\worker-release-taptap-20260921-v055-formal1\worker\src\q1DailyJob.js` | `159acdfa737c2814224e786a5801e2114f5daff1682fb6dc40edbc2df624611a` | 与前采样一致；未技术阻断 |
| `C:\ProgramData\PublicOpinion\releases\worker-release-taptap-20260921-v055-formal1\worker\src\translationWorker.js` | `7d5b859bfb0fee118db4c271ce536008c983115ef150e0d8f4b0ffd1ebdf1b59` | 与前采样一致；未技术阻断 |
| `C:\Users\Administrator\AppData\Roaming\Code\User\project manage\bigPlayer\public-opinion-system\worker\q1-daily.cmd` | `8d787151197ac9c9c5426368d16117eb06734caa4657062c90f62bab9187ae12` | 与前采样一致；未技术阻断 |
| `C:\Users\Administrator\AppData\Roaming\Code\User\project manage\bigPlayer\public-opinion-system\worker\src\q1DailyJob.js` | `159acdfa737c2814224e786a5801e2114f5daff1682fb6dc40edbc2df624611a` | 与前采样一致；未技术阻断 |
| `C:\Users\Administrator\AppData\Roaming\Code\User\project manage\bigPlayer\public-opinion-system\worker\src\q1DailyAnalysisRunner.js` | `0584dd90cb0e6d56ab6e1585cfc67928df71baaaa0917ea472661281d6ba958a` | 与前采样一致；未技术阻断 |
| `C:\Users\Administrator\AppData\Roaming\Code\User\project manage\bigPlayer\public-opinion-system\worker\src\dailyRunner.js` | `b9fcf8ced9deecdbfa9aa61fa98e21f656a93a4f4e6812cec2428bf85ff25784` | 与前采样一致；未技术阻断 |
| `C:\Users\Administrator\AppData\Roaming\Code\User\project manage\bigPlayer\public-opinion-system\scripts\overseas-verify-exact-ai.js` | `7063a9bd6065879c7ee2e564eac9ee9b79543145555b7ca5adff67a152ff12af` | 与前采样一致；未技术阻断 |

独立script blocker仍只是不完整overlay，SHA `9c2ebe0825afc5576b8997a58692e3e8882d0f2b66b22fd6c86ac76912340dc6`；安装CLI main未验，不能说工作区写脚本已被它隔空封禁。只读 `overseas-exact-ai-readonly.js` 保只读用途，不混作写入口。

## API/shared准入、双gate排空及失败处理

下表全为**未来核收要求**，无步骤已生效。C0/C1应在窗口前完成；C2–C9依赖真实adapter和批准窗口，不能从本离线清单直接执行。证据ID和离线布尔不替代锁owner、暂停或事务排空。

| 阶段 | 当前缺口 | 放行要求 | 失败处理 |
|---|---|---|---|
| C0 重新核收当前 API 与前端基底 | API和前端漂移；v089 API以旧login-auth-fix为来源，不允许覆盖新sync-auth-persistence-fix | 当前新API完整只读归档、差异范围、必要重新集成与独立验收；保护v214；新统一revision另冻，不改v089 | HOLD；不修改服务XML、不追PID、不回退新发布 |
| C1 精确身份/回退工件/准入adapter核收 | shared/analysis原归档仍匹配；API当前新包未归档；translation拒读；实际adapter/loaded pause未实现 | 新API和海外完整回退原件；当前四XML/双任务原XML；技术准入/manual blocker、双gate/新main pause/编译receipt最小实现和独立核收；translation stop-only方案明确核收 | 缺任一保持HOLD，不先启动补材料 |
| C2 关闭任务和Q1/manual/script新触发 | 双任务Ready/Enabled；13旧路径未封禁；未见相关运行进程只是本次采样 | 精确TaskPath/name/Action核对后禁新触发，技术blocker覆盖实际worktree和旧包/manual路径；正在执行cmd/node/python子树有界排空 | 身份/进程漂移或不能阻止再起即止；不kill未知进程 |
| C3 API/shared写准入与已接受事务排空 | 没有生效暂停证据；未读取DB/provider状态 | 已验维护adapter关闭API写准入/shared新run，保必要读鉴权；计数证明已接受API请求、页面事务和任务/manual运行完成 | 页事务/provider未知或COMMIT_UNKNOWN即停，不能把stop-service当排空证明 |
| C4 固定同连接持双gate | 本轮无DB连接/GET_LOCK动作 | 固定connection按po-analysis-consumer→po-translation-consumer，分别有限等待≤60s；两个IS_USED_LOCK均等于CONNECTION_ID；递增新鲜heartbeat、连接存活 | 第二锁失败只释放该连接实际持有的第一锁；失联/owner变化立即停，准入保持关闭；不释放他人锁 |
| C5 旧服务/任务/manual排空与再起核查 | 四服务Running/Auto；gate不覆盖ungated旧API/shared/script | 已接受事务/provider状态可知；有界停止已核身份的四旧实例及任务manual子树；持续证旧writer不自动再起，双gate仍由control持有 | 超时/provider未知/再起即HOLD；不清lease、不重置active、不重新派付费调用 |
| C6 安装已重新核收候选并换指向 | v089仅冻结参考，当前API目标不匹配；没有本轮部署目标或adapter | 明确新revision目标且不存在冲突，完整SHA，四XML entry/workingdir与海外cmd Action参数语义；双任务仍禁；不在此步骤运行DDL | 字节/原件不符停止；translation不得用其它包代替原回退包 |
| C7 新进程暂停、实际loaded和双gate交接 | 没有业务依赖前pause/编译receipt/真实handover；resident main未验 | 启动前已验bootstrap首先暂停于任何env/DB/provider之前；记录编译时canonical path/原字节/编译文本SHA和PID/createTime/runID；交接时放行指定唯一consumer取gate且API/shared准入仍关 | 禁止先起main补receipt；模块/身份/owner不符停止，新writer有界排空后精确停 |
| C8 批准范围的真实业务与失败回退 | 本轮只读不签数据/通知结果；QA只隔离函数 | 精确source/account/game/community/site/board/feed/window/content/job/版本/调用预算；一次受控境内producer和海外任务验证入库、当前分析/译文/job/cache/audit；通知按另已核收范围 | COMMIT_UNKNOWN精确审计对账，不盲目重队/重复付费调用；保已提交ledger，不删数据 |
| C9 恢复准入、海外调度及下一真实定时验收 | 尚未切换；双任务原Enabled不是新包恢复 | 真实loaded/main、禁止旧writer再起和业务证据齐，方按核收恢复API/shared与海外Enabled；旧Q1仍Disabled，直到另有已验安全路径；下一实际定时Run链验收 | 缺实际入库/当前结果或境内回归不得称恢复；不把exit0/HTTP200当采集成功 |

锁owner及heartbeat必须与同一控制连接联结；首次有效heartbeat前不能进入排空/重核，sequence递增且有限期限，拟换指向前另一次fresh owner与运行身份核对。失连接/owner变化/未知provider/COMMIT_UNKNOWN/新manual进程出现后进入阻断，不能靠新heartbeat自动恢复。新main没有通用pause，**不得先启动常驻循环再补loaded或准入证据**。

## translation拒读下的stop-only回退

现役translation原entry和406枚举文件全部读取拒绝（PermissionError/errno13），XML可读；原ZIP只有0文件，不是完整原包。没有改ACL、换身份或用别的包冒充原件。本轮将 **旧translation consumer停止且不自动恢复** 写为未来stop-only回退方案，尚未核收执行。

该方案的业务影响是：若新翻译失败，翻译消费保持停止，已有待处理任务保留，不能把停止状态报成翻译服务恢复。未来切换前必须明确接受此可用性影响，并有实际技术控制抑制Auto/recovery/manual再起；当前StartMode=Auto和本清单不能做到。若未核收stop-only，也未由允许身份完成原包归档，仍保持HOLD。

切换前失败保持准入关闭、双任务禁、旧split停；API/shared是否恢复读取或安全采集producer，按当时ledger和writer能力精确核收，不RestoreAll。切换后失败关准入、有界排空、按新PID/createTime停止新consumer，保存intent/audit/repair/结果；可恢复已核原XML指向，但旧split保持停、Q1保持禁。API不能回退到早于本次新授权修复的基底，前端v214/LoginSession不操作。

不DROP schema、不全库旧快照恢复、不清lease/active、不删ledger或盲目重队；DDL不由普通事务回滚。COMMIT_UNKNOWN需精确审计对账，禁止重复provider付款调用。失gate不能声称仍持锁，停止自动dispatch、保外部技术准入闭合后重新核收。

## loaded与resident main验收：窗口前/窗口内

窗口前须实现并独立核收新revision bootstrap/暂停/编译receipt及真实adapter；v089自身没这些机制，不改冻结包补探针。receipt必须在模块编译时记录actual文本SHA及原字节、canonical路径、loader/version、PID/createTime/runID/序列；分类JSON/native/ESM/懒加载，未知项留UNKNOWN。不能事后readFile磁盘SHA或require.cache冒充生产loaded，不注入当前进程/开inspector/重启补证据。

| 对象 | 窗口内必须验的main/loaded链 | 当前结果 |
|---|---|---|
| 新API | bootstrap先暂停；app→同包Repository/当前connector/login client；服务唯一Node，实际编译身份、保新登录和来源保护 | 未实现/未验，且需新API基底 |
| shared | 同包worker.js main/scheduler；关闭准入期间零新采集，已接受页事务可排空；放行后仅批准一次producer | resident main未验 |
| analysis | analysisWorker→worker/dailyRunner；指定唯一consumer取analysis gate、暂停/交接真实，当前结果事务与receipt一致 | 函数隔离PASS；resident main未验 |
| translation | translationWorker runLoop；唯一consumer取translation gate、无自动backfill超出名单，原包stop-only边界可用 | 函数隔离PASS；main/原回退包未验 |
| overseas cmd | 正确TaskAction/workingdir/参数→actualcmd/main/runID→site/board/feed/timewindow/页面事务/intent/结果关联 | 未执行cmd/真实采集 |
| Q1/manual/exact | 实际工作区与旧包入口拒执行，任务/manual/recovery持续不能再起，安装CLI main边界核收 | 技术blocker未实现 |

真实connection ID/锁owner、已接受事务/页排空、provider状态、新进程receipt/常驻main、失败回退和下一次实际定时链条只能在未来批准窗口及实际运行发生时取证。当前无生产DB观察、不签provider状态或数据成功。

生产schema/config/精确名单和通知抑制沿既有独立范围仍未完成；准备阶段需核收，不在此文执行。真实业务验收填明确source/account/game/community/site/board/feed/时间窗/content/job/版本和一次调用预算；境内真实有效入库与安全入队、海外实际任务一次及下一定时运行、当前分析译文/cache/job/audit一致后才可报恢复。HTTP200/exit0不等于入库。

## 保护对象、工件核对与交接

当前前端Node18460/wrapper19104，`2026-10-10T10:06:24.7724890Z`（北京18:06:24），release `C:\ProgramData\PublicOpinion\frontend3001\releases\release-20261010-sync-auth-v214`。sources.html SHA `23375bd3297e46a10ebf2cf223bf43c31c256c9586e9b331d68dfe6563e399d4`，sources.js SHA `6abdd14008e9bbb3da84d534f96bd78a9aaf2a4f2e029083084f921d5f5babbd`，与v211不同；保护新v214，既有草稿行为在新前端是否继续正确本轮待确认，不把磁盘差异称退化。LoginSession Node19468/wrapper19896身份稳定，非操作对象；不声称其零DB写。

本轮只读CIM/任务导出/hash及本地文件集合，不读取环境值、不HTTP/DB、不改服务任务ACL/DDL/生产数据、不重测试。前后身份、磁盘清单、生成脚本、历史引用和SHA列v092。shared/analysis归档可复用的前提是未来仍匹配；当前新API/海外完整回退包、当前XML/双任务原字节归档尚未本轮制作。文件集合/metadata核对通过不等于控制生效。

交经理收口漂移与最新控制范围，先安排新API基底归档和必要差异再集成；其后补实际adapter/加载暂停/再起控制等精确缺口。v089保持原字节，当前生产继续HOLD，所有离线步骤均未生效。

## 后续归档签收更新（北京时间18:13）

按经理随后派单，当前API396文件和v214前端34文件已完整只读归档，两份当前服务XML原字节同时保存，前后身份/源字节/ZIP读回核验通过，见v093/v094。这替代上文在18:09采样时“当前新API完整归档未制作”的状态；海外完整回退ZIP和双任务原XML仍未制作。API新基底重新集成、技术准入/再起控制/双gate/loaded main仍未实施，v089对新API仍不可直接执行，controlsEffective=false，生产HOLD。当前授权持久化、expiry替换和probe复用必须保留，仅再合writer范围。
