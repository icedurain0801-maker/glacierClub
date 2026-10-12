# 海外真实运行影响与决策附件草案

Status: PLAN_ONLY / SHARED_WORKER_CUTOVER_BOUNDARY_CONFLICT_HOLD / RUNTIME_NO_GO
Owner: 开发负责人

本附件依据v104/v108/v110/PRD及员工本机只读观察整理；不执行生产DDL/ACL/账号刷新/HTTP/AI/切服务，不覆盖经理待办。历史3306事故没有写前基线/日志，不能由当前进程连续性推断业务库未变。08:00目标不扩大授权。

## 已观察与待证明

- 员工只读观察现役XML `C:/ProgramData/PublicOpinion/services/PublicOpinionWorker.xml` SHA `82cb2aa0b974c0df980405f3eef379f88c8c59d12d3ef06ab9ad7dc8111acbee`，入口 `C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1/worker/src/worker.js`，配置账号LocalService。
- 配置WORKER_STATE_ROOT为现役candidate-staging下data/state，不是海外独立持久根；观察不是实际进程写权限/唯一消费者证明。
- `C:/ProgramData/PublicOpinion/data`存在且ACL继承关闭，LocalService Modify、SYSTEM/Administrators FullControl；上级PublicOpinion仍继承较宽权限。海外目录与backups不存在。负责人执行前须再次只读核SDDL/reparse及实际身份，不能只核叶目录。
- receipt/Journal/intent当前限定仓库根.temp，生产持久能力未实现，不能改env绕过或把hash当授权签名。

## 持久目录与备份（仅建议路径）

建议新增 `C:/ProgramData/PublicOpinion/data/overseas-bigplayer/v1/{receipts,journals,intents}` 与 `C:/ProgramData/PublicOpinion/backups/overseas-bigplayer/<批次>`；不改国内state/locks。状态叶目录LocalService最小Modify，备份不授其写入，SYSTEM/Administrators FullControl。若祖先可被非授权用户替换，先列精确旧/新SDDL及祖先路径，不递归重设整个ProgramData/PublicOpinion。

能力设计须核全部祖先realpath/reparse/ACL、真实LocalService创建/fsync/hardlink发布/重启读取；文件fsync不证明Windows掉电目录项持久。停admission排空后备份完整文件inventory+DB run/epoch/task集合；DB备份命令、权限、保留期待确认。恢复不得旧备份覆盖新epoch或删pending/audit。生产两表/schema diff、备份还原演练及独立QA齐备后另决策。

## 第二源（历史记录，不当当前事实）

source `8c690d6e-12ea-4ad3-b434-d941276c4906`，account `a80c93e9-51b9-478a-998a-e63772d323ff`，board absent真实值待确认。v040记录config三site：`site-b65999d6b3a837e58e02efae1e531d42`、`site-245a01037038ff32930961262a10604d`、`site-444d2357e4b5fcab201568f5eebcaf23`，registry仅`legacy-b65999d6b3a837e58e02efae1e531d42`。历史引用25 runs(site NULL)、1113 CP(site NULL)、4848 CP(legacy site)、12318 contents，需执行前重新只读复核。自身一次401不证明board值或永久无权。

先核自身source/account/game/community/config版本、完整安全URL/hash与引用；优先评估首站保留legacy ID仅新增另两站，但这不是已定配置。真实board必须来自自身运营定义/授权证据，不借首源100017。形成完整before/after/版本CAS后独立QA；不重键、不删site/run/CP/content，不用现配置重新归属历史内容。回退新增registry有引用时保留。

## 自身账号有界授权HTTP（须单独批准）

首源历史模板：source `081a16d2-5545-4afd-9c65-e04777e4540b`、board100017、languageId2/9/16；自身account实际绑定待核。每站token exchange→context→v2board，最多9请求、90秒软窗口、单请求10秒，无重试/v1 fallback。token exchange即使GET也可能创建会话，不称无影响只读。授权阶段不请求feed/comment、不写任务内容/凭据，token只内存，日志不含token/cookie/正文/个人信息。第二源context最多1次失败即停；账密登录/刷新先列实际服务调用及持久化位置再批准，不循环刷新。

授权检查通过后另冻结完整采集计划：仅https://club-en.q1.com，逐端点列context/schema/feed/动态/详情/comment/reply及fallback；总次数、时间、并发、页数、history预算待真实schema规模确认，不能借9请求称完整采集。预算耗尽只partial，不算穷尽。

## AI/翻译的精确范围与预算

`claimAnalysisJobs`支持contentIds，但worker当前processPersistentAnalysisJobs未传scope.contentIds，source/window会消费同窗其他任务；翻译runControlled(jobId)可避免补队列，runLoop优先job后会转全局runOnce，不可当持续受控入口。

先隔离实现精确 `{contentId,fingerprint,source/account/game/community,jobId,profile/version,targetLanguage}` allowlist，deep派生亦限同content/version并计费；使用既有唯一消费者或证明同门禁接管，不旁路起生产分析器。provider/model/价格/调用数(含重试)/输入输出token/金额上限待确认，不填默认预算。翻译UTC日po_translation_call_budget不是本批预算；分析内存callState重启重置，不证明持久全局上限。分析可能写alert并外部通知，未批准发送须证明通知阻断但不破坏记录。pending只证明入队，验收看结果/fingerprint/version/译文/实际费用。

## 共享Worker切换：BOUNDARY_CONFLICT / HOLD

经理已审本草案并指出暂停共享Worker与国内“不改/不停/不重启”冲突。撤销将下述切换流程作为本次可执行建议，禁止实施；保留现役国内健康运行，不默认KEEP_STOPPED停现役，不另起第二生产消费者。后续仅研究不影响国内的交付路径并提供证据；若既有进程无法热接代码、无法无停顿交接唯一消费者，应明确客观限制，不绕过边界。下述原流程仅作为冲突影响记录，不是执行计划。

可信三态前置到queue初读/补读/manual清marker前/due/poll/scheduled/recovery：目标、明确非目标、身份无效。非目标保旧路径；无效不得清marker/claim/recover。一个共享Worker路由，不并跑海外消费者。

只替换冻结PublicOpinionWorker release/XML，API/3001/DB/Analysis/Translation不重启。共享暂停将延迟国内/其他平台新采集，暂停窗口及积压阈值待实际基线，不承诺固定60秒。

精确旧/新hash/CAS→停admission/scan/poll→join页事务/续租/lane→旧PID及自动重拉入口确实停止→零消费者→启一个候选→核PID/starttime/build/heartbeat/lease及非目标/API/3001/DB连续性。跨scope/双消费者/fence失效/缺列SQL立即停新增领取。回退先排空再核旧版schema/新run兼容；未证明旧版不捡新海外任务时KEEP_STOPPED。回退不删数据/jobs/账本/Journal。

## 给经理的分批决策清单

| 决策 | 先补齐附件 | 当前 |
|---|---|---|
| 持久根/ACL与生产DDL | 路径、旧新SDDL/schema diff、备份恢复、独立QA | 未齐，不执行 |
| 自身有界授权检查 | source/account精确绑定、端点次数时限、刷新/凭据写边界 | 方案，待绑定 |
| 第二源配置 | 自身board、完整URL/registry before-after、引用/CAS/回退 | board未知 |
| 共享Worker与真实采集 | 不影响国内且无第二消费者的可行路径证据、HTTP/写范围 | BOUNDARY_CONFLICT/HOLD，不切现役 |
| AI/翻译 | allowlist、唯一入口、模型/调用/token/金额、外部通知边界 | 未齐 |

可先只读本机XML/SCM/PID/任务定义、文件hash/ACL/reparse/release。生产source/schema/队列规模SELECT依既有精确授权复核，员工本次未执行。不要一次性生产GO，不请求超出已知目标的授权。
