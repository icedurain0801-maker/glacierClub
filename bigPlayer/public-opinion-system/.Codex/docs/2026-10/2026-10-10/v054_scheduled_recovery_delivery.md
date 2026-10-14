# 海外定时恢复与六社区交付

Status: 候选已准备；未切换服务、未改任务/来源状态；实际定时未通过。
Owner: 开发负责人
Date: 2026-10-10

## 已完成与实际根因

真实接口、有限样本入库及 3 内容分析翻译已通过独立 QA v045/v046，停止重复验证。一直没有收口的原因涉及不同层，不能继续用单页抓取成功代替定时成功：

1. 认证曾默认把社区 Token 当 SDK Token 二次兑换；已修正式 session，并通过真实 context 接口。
2. 真实站点 env=web 曾被合同只允许 env=1 拦截；已修。原件入库曾使用生产 CHECK 不支持的状态，事务完整回滚后改用已有状态；已成功入库与无重复重放。
3. 实际运行的是 ProgramData 内 v055 Worker，修改工作树不会使它更新。现役全局 expired recovery、queued/poll、manual marker、legacy due 与统一 scheduler 没有目标来源排除，新进程私有锁约束不了它。
4. Windows 海外 02 任务的 .cmd 不存在，最新退出码 1。已有 lastNightOverseasDailyJob 仍调用共享 worker 链；SourceRouter 正式 scheduled 分支仍 implementation incomplete。因此补一个 .cmd 或移除 guard 都不是可用修复。
5. 独立目录只能藏新进程的私有运行状态，不能阻止旧 Worker 按同一 po_sources 到期或手动标记自行发起采集；这条“零共享改动即可排他”的路线不可行。

境内此前崩溃的具体触发改动和日志对应尚未确认，不把推测写成根因。本轮没有改、停或重启国内实例。

## 可审查的采集排除候选

构建入口：`scripts/prepare-overseas-shared-exclusion.js`。已生成仓库根 `.temp/overseas-shared-exclusion-1791603599337/`，含 before/、candidate/、delivery.json。

它从现役 `C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1` 读取，仅生成以下 5 文件候选，不使用整个 dirty 工作树、不部署、不调用数据库或 HTTP：

| 文件 | 具体变化 |
|---|---|
| worker/src/worker.js | runSource 首部排除目标，runPagedSource/syncStagePage 在采集前拒绝目标 |
| worker/src/workerScanLease.js | expired recovery 同时按 source_id 与账号所属 source 排除目标；保留原排队/过期规则 |
| server/src/db/repository.js | queued/poll、manual marker、legacy due 排除目标；claim 的原子 UPDATE 同时按 source/account 排除目标 |
| worker/src/schedulerCandidateLoader.js | 到期候选 SQL 排除目标，包含 allowlist 情况 |
| worker/src/schedulerRepositoryAdapter.js | enqueueScheduled/scheduleSlotAtomic/acquireLease 在任何写入前拒绝目标 |

目标仅 `081a16d2-5545-4afd-9c65-e04777e4540b`。不改变分析/翻译认领；它们继续作为唯一共享下游消费者。5 个候选 JS 均通过 node --check；这是语法自测，不是已部署功能 PASS。该包是排除补丁，尚不是完整海外生产消费者或完整部署 release。

当前生效自动任务未发现绕过这 5 文件采集目标的入口：Q1 Daily 02 固定其他来源，海外任务入口缺失。dailyRunner 手工调用在 runSource 前仍可发授权 preflight；切换阶段禁止另行手工运行旧 dailyRunner/旧海外 launcher。

## 最小实施顺序与共享影响

1. 先以 v055 为基底组装仅 5 文件变化的新共享采集 release；保留排除版作为回退，不能整包发布当前工作树。
2. 新海外专属消费者复用已通过的正式 session/connector 与生产入库方法，独立持久记录 slot、站点、cursor、结果；按 source/account/game/community/board 校验归属。不得复用 fixture 表作为生产状态。
3. 启用前等待现有采集完成并关闭新 scan 准入，排空后仅切换 PublicOpinionWorker。这个切换需要共享采集实例重启，因此会造成国内采集短暂延后；时长待实际排空情况确认，不能承诺零影响。API、frontend、AI、translation 不重启，不做 DDL。
4. 确认共享新实例排除目标后，海外独立消费者接管目标；手动 marker 先持久 receipt 再原子交接，避免清空后丢请求。下游仅入已有队列，不增加第二个 AI/翻译消费者。
5. Windows 02 action 最后指向正式持久 release 的有效 launcher，显式 config/workingdirectory，不指向临时包或未冻结工作树。
6. 只做一次必要真实定时触发，核抓取入库、正确社区/语言 feed 归属、无重复消费及可读下游结果。已有 3 条付费 AI/旧抓取不重跑。

**本轮未执行步骤 1 的部署或步骤 3–6。** 经理当前要求“不重启或更改国内实例，确实只能改变国内实例则交精确影响方案而不执行”，因此不能实际启用这条共享切换路线。即使批准共享切换，也须先完成步骤 2 的生产消费者，不能把当前排除包直接当定时修复上线。

停止条件：国内正常采集受到异常等待/锁影响，目标或语言归属不符，重复领取，租约丢失，数据库提交结果不明，真实接口/入库失败。停止海外新派发，保留原件与已提交页面，不清库、不重复发请求。

回退：停止海外新任务并等待当前页面持久提交；共享 Worker 回退到 v055 **带相同目标排除** 的 release；不得回到原始 v055 重新竞争目标。恢复海外定时入口前确认没有旧新消费者并行，已提交页使用持久 cursor/唯一 slot 防重。

## 六社区正式交付包

入口：`scripts/prepare-community-selector-delivery.ps1`。已生成仓库根 `.temp/community-selector-delivery-20261010-113750/`，包含 candidate/ 的 7 文件、before/ 的当前正式旧 7 文件、delivery.json 和 README.md。

7 文件为 assets/scope.js、index.html、content.html、alerts.html、sources.html、collection-runs.html、keywords.html。候选已通过原 QA，正式静态根尚未更新。精确目标：`C:/ProgramData/PublicOpinion/frontend3001/releases/release-20260924123831-boardid-save/public/admin/PublicOpinion/`。

服务逐请求读取磁盘，因此无需任何重启。按包内说明 scope 先、六 HTML 后，同目录 staging→rename；失败恢复已替换文件。原 release manifest 保留，用包内 delivery.json 追加实施记录。正式页面选择六社区与地区切换、接口结果正确即可验收，不重复候选矩阵。本轮仅准备包，未部署。

## 岗位交接

开发负责人：已交 5 文件候选和 7 文件正式包，继续承担代码唯一写入；海外生产定时消费者尚未交付。
项目经理：维护唯一待办，处理共享采集排空切换是否允许及正式 UI 实施范围；没有该决定不改现役。
测试负责人：已有认证/入库/3 内容 AI 翻译收口，不复跑；新定时只核最短真实接口功能及消费者冲突，六社区只核正式入口。
