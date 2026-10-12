---
last_updated: 2026-10-10
status: readonly-plan-no-loaded-or-main-execution
owner: 开发负责人
production: HOLD
---

# loaded字节与常驻main的精确只读验证方案

本轮交静态依赖及采样清单，没有运行任何server/worker常驻main、真实Q1 cmd或独立AI脚本，四现役loaded仍UNKNOWN。新API已漂移到login-auth-fix，原v078 API候选需先保新登录修复重新集成；不能按原v082直接启动。本方案不注入现役probe、不启inspector、不改ACL、不重启补证据。

原件仓库根 `.temp/risk-normalization-20261010/employee-writer-loaded-plan-v083/sampling.json`，静态只读取冻结源码/解析literal require，不执行require。五入口分别发现33/44/46/16/47个本地JS模块，可解析literal相对require无缺失；动态加载、条件实际执行及node_modules编译字节不由静态扫描证明。最终SHA在核收manifest列出。

## 入口及启动副作用

| 对象 | 候选入口/静态关键链 | 为什么不能在本轮启动main验收 |
|---|---|---|
| API | runtime-api `server/src/app.js`→Repository/connector/login client | require顶层loadRuntimeEnv、new Repository和集成对象；main supervisor→startServer先repo.health再listen。会读环境/触DB并监听，不作为纯只读扫描命令 |
| shared | runtime-collection `worker/src/worker.js`→runOnce→采集及enqueueOnly | 顶层loadRuntimeEnv；main校验scheduler mode后立即scheduleRun，随后setInterval，可能HTTP采集/写入/心跳，signal关闭不能当已经排空 |
| analysis | runtime-analysis `worker/src/analysisWorker.js`→同包worker/dailyRunner→runAnalysisLoop | imported worker顶层loadRuntimeEnv；main buildDeps→立即backlog轮次，取得analysis gate后消费/provider/事务。没有通用启动pause，不能先起main再补核收 |
| translation | runtime-translation `worker/src/translationWorker.js`→Repository/currentTranslationConsumer | 顶层loadRuntimeEnv；main runLoop立即buildDeps、预算/backfill/claim/provider/提交，随后重复循环。只隔离函数fake provider通过不能称服务main已验 |
| overseas | runtime-overseas `worker/src/overseasProductionDaily.js` | main取得来源/页事务与运行锁，site session真实fetch、intent receipt持久化/heartbeat；不能执行实际cmd作静态验收 |
| Q1 | 任务Action仍工作区 `worker/q1-daily.cmd`→q1DailyJob/runner/repo | v078同名候选拒旧writer，但实际cmd不指候选；调度Enabled和当前无Node不证明禁止再起。真实cmd未验 |
| exact script | 工作区 `scripts/overseas-verify-exact-ai.js` 与独立scriptOverlay | QA仅VM测三个导出写方法提前拒；安装CLI main未验，本轮不执行，不假称包外脚本已技术阻断 |

`runtimeEnv`在serviceMode要求PUBLIC_OPINION_ENV_FILE有效非reparse文件，最终process.loadEnvFile会读真实配置。仅require.main为false仍可能发生顶层环境读取/对象初始化，不能笼统宣称require导出安全。静态采样不读取env值；归档敏感字节仅忽略目录保存。

## 精确采样表

| 证据类型 | 当前精确字段/来源 | 证明和限制 |
|---|---|---|
| 服务 | 四service name、State、wrapper PID、StartMode、wrapper executable、wrapper command SHA、XML path/SHA | 服务配置/状态，不证JS loaded |
| Node | 仅相应wrapper直接child且必须唯一；PID/parent/createTimeUTC/executable/entry/完整commandSHA | 当前进程归属和启动入口，不证运行模块字节；PID复用需createTime配对 |
| 任务 | Q1/overseas TaskPath/name、XML原字节、Action executable/参数SHA/workingdir、Enabled/Running、Last/NextRunTime | 当前配置和观测，不证未来禁再起或本次实际入库成功 |
| manual进程 | 明确Q1/daily/exact/旧包路径、cmd/node/python子树；每PID/createTime/parent/commandSHA | 采样时存在性，不能证明未来不再起或所有动态writer已覆盖 |
| 磁盘 | 完整runtime路径集合/逐文件SHA、entrySHA、schemaSHA、相对依赖路径 | 读到的磁盘字节，不证旧进程此前已加载；可重复核前后漂移 |
| 新loaded（尚缺） | 新revision、bootstrapSHA、run ID、NodePID/createTimeUTC、编译的每模块canonical path+原字节SHA+内容编译SHA、loader类型、模块加载时序、暂停状态 | 只有启动前安装并验证的receipt机制才可提供编译时事实；当前四现役没有机制，不能事后靠磁盘hash填充 |
| gate/准入（尚缺） | 固定control connection ID、双锁owner、采样时间/心跳deadline、API已接受写数及页事务、task/manual禁止新触发证明 | 属后续控制器证据，本轮无DB连接、不伪造receipt |
| 保护对象 | frontend v211 Node47928/wrapper23200及source静态SHA、LoginSession基线19468/19896 | 非操作对象，执行前仍需核漂移；不证它们全库零写 |

新API精确基线：Node9328/wrapper8432，createTimeUTC `2026-10-10T09:27:20.5953320Z`，entry `C:/ProgramData/PublicOpinion/releases/release-20261010-login-auth-fix/server/src/app.js`，XML/command/实际文件SHA沿v083原件。新采样是17:35观察，不代替未来执行前采样；原v082 API条目作废，生产HOLD。

## 未来批准后最小loaded机制设计（未实现）

若需要新进程实际编译字节证明，应在**新候选revision**启动前设置最小bootstrap，先验证bootstrap自身和完整manifest，再进入业务入口；不得把现役进程作为注入目标，不改冻结v078。完整实现与最小独立QA先交核收，当前只是方案。

1. 从明确release根启动，runtime/loader版本冻结，禁止额外未核NODE_OPTIONS/preload；只保允许入口，不打印环境和Token。bootstrap应在任何业务module/env/DB/provider之前进入暂停门。
2. CommonJS需记录实际传给编译器的文本及关联原字节，native/.json/ESM/动态加载分类，不能只在require.cache生成后重新readFileSync磁盘就称loaded；后续懒加载也需持续记录，未记录模块明确UNKNOWN。不为追完整性强制加载所有模块。
3. 把canonical路径、实际编译SHA、manifest期待SHA、loader/version、bootstrap/run ID与进程创建身份联结；仅匹配路径并hash当前磁盘不够。receipt原子写到限定本地忽略工件，不存module正文/环境/凭据。
4. 暂停状态需在业务依赖与所有副作用之前，API/shared准入与consumer gate交接要有专门已验adapter；只有编译receipt不等于安全暂停。控制连接失联或身份/编译SHA不符立即停止，禁止先运行再补批准。
5. receipt不能阻止任意恶意JS篡改，也不证DB事务结果、采集成功或通知抑制；真实业务最小验收另取交易/任务证据。

未来最小验证仅针对新机制：离线合成模块/字节改变可拒、懒加载分类、receipt原子/路径/失联、暂停期间零DB/provider、释放后仅批准fake provider和owned loopback DB的单轮main+有界退出。实际API登录/来源回归与writer重叠另按新revision直接场景验证。当前没有执行这些试验，现役任务/常驻main仍未验；不复跑既有矩阵或三站。

## 当前可交付与未确认

已完成静态literal依赖清单、实际身份采样和启动副作用说明，未产生loaded/main运行证明。当前candidate没有通用启动pause、编译receipt或生产gate交接器；翻译包ACL拒读且完整归档不足。按v083保当前API新登录修复重新集成范围，再由经理安排最小新工件。所有工件仅供核收，不能解除生产HOLD或称定时同步恢复。
