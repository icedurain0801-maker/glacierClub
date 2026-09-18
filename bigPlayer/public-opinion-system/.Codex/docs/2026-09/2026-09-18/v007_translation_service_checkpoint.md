# 翻译 P0 服务与删除阻断记录

Status: 指定内容恢复；服务受控暂停；批量与删除未通过，不判整体完成。

## 变更与基线

- 统一服务配置、仓库 .env、.env.example 的 AI_TRANSLATION_DAILY_CALL_LIMIT 同步为用户授权的5000。未打印密钥，未提交.env。
- 原配置备份：`C:/ProgramData/PublicOpinion/config/backups/translation-20260918/public-opinion.before.env`，按受控配置权限保存。
- 新增 migrations/028_translation_call_budget.sql，已仅执行该表CREATE IF NOT EXISTS，不执行其他待应用迁移、不删除旧数据。
- quota ledger按UTC日界（保留旧逻辑）在每次HTTP请求前原子预留；重试也计一次，失败预留不退款，跨进程/重启不清零。历史未记录调用无法回溯，本日启用前未观察到翻译成功；不能将新ledger当历史用量证明。
- AiTranslator支持注入持久化guard，正式translation buildDeps注入Repository预留；独立纯单测仍使用内存guard。
- quota exhaustion 保持retryable、次UTC日重试，不因配额耗尽终态。后续工作树补丁扣回仅预算阻塞的领取attempt，保留owner/status/lease fence；此后续补丁尚未部署。
- 服务模板：scripts/windows-services/PublicOpinionTranslationWorker.xml；render-config.ps1支持该目标；status-services.cmd加入翻译服务。通用install-services尚未支持翻译目标，不能称所有运维脚本均接入。
- 工作树后续补丁：优先任务非终态不进入普通队列，缺失任务fail-closed；回填批量限定1。服务运行包仍是初版，后续补丁未同步，不得未经验证直接启动。

## 真实服务执行

- WinSW二进制SHA256：05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA。
- 独立运行包：C:/ProgramData/PublicOpinion/releases/translation-release-p0-20260918144000；build-worker-release.ps1构建及405文件manifest验证PASS。
- 实际包装器/XML：C:/ProgramData/PublicOpinion/services/PublicOpinionTranslationWorker.exe / .xml。
- Windows名称PublicOpinionTranslationWorker，Auto，账户NT AUTHORITY\LocalService；SCM已配置5/30/60秒恢复。
- 14:39首次安装/启动后入口EPERM，进程不能读入口文件；5秒/30秒自动恢复尝试有wrapper日志。定向修复该release的LocalService RX权限后14:40:03启动。
- 14:40启动SCM PID40624，入口Node15892；实际启动日志dailyCallLimit5000、batchSize5、budgetTimezoneUTC。
- 首次指定翻译INVALID_RESPONSE，retryable attempts1；随后真实重试completed attempts2。没有伪造状态。
- 14:40:37主动stop后仍出现14:40:40恢复启动（SCM37752/Node16992）。14:41:56为冻结批量，临时清空该服务SCM恢复动作后再次stop，State=Stopped/PID0。恢复动作目前临时禁用，需在新边界审批和稳定性验证后恢复，不能报服务运行PASS。
- 未停止/重启API或分析Worker。

## 1491625证据

派单UUID有笔误，按外部contentId核验真实content_id=aafa2616-4a16-43d6-8ccf-c77f873faf6f，真实job=451596e6-96e2-40b0-9d48-7cc66cbd224d。

状态completed，attempts2，completed_at/translated_at=2026-09-18 14:40:44。中文标题“错过签到”，中文正文已入po_content_translations。未做真实页面浏览器中文验收，不重复补这条。

停机后队列快照：pending11900、running7（未到期残留租约）、retryable3730、completed855、failed36、total16528；最近5分钟completed23，lastSuccess14:41:50；ledger reservedCallsToday27。短期观测吞吐4.6/min，非持续保证。默认回填100曾补入或重置指纹变更任务，故队列数变化不能仅解释为完成数；后续已限定工作树backfill1，未部署。

## 删除预览与备份（DELETE=0）

授权条件：c.published_at < '2026-09-10 16:00:00'（UTC）且po_translation_jobs.status<>'completed'；期望affected9185。

事务SELECT FOR UPDATE锁定并完整导出实际9409条，数量与9185不符，已ROLLBACK，无DELETE。不删completed、不动po_content_translations。此前只读9388是不同时间快照，不用旧快照冒充当前边界。

- 备份：C:/ProgramData/PublicOpinion/config/backups/translation-20260918/jobs-preview.json
- SHA256：85081a440df4119b317d9abb5b0c6a51abe676c3925ae708108dcff5ab7be43a
- 脚本：.tests/2026-09/2026-09-18/translation-cleanup-preview.js，仅备份预览及ROLLBACK，不含DELETE。
- 备份采用wx防覆盖；原始job行和UTC边界完整保存。仍须在隔离库验证恢复及精确ID清单，不使用min/max范围。

数量不符依派单停机回报，不擅自把删除授权扩大到9409。近7天no_job入队、6270一次性override均未执行；全局limit仍5000。一次性override的计费调用上限（重试是否计入）、精确内容清单和最新缺译数量须在再派单中明确。

## 验证与剩余门禁

translator/translationWorker定向测试23/23 PASS，覆盖持久化guard重启对象不清零及预算错误不终态；后续priority状态机、decrementAttempts仍需增加专门测试和部署包验证。

剩余：新精确清理清单/数量审批；只处理批准近7天范围的有界补译入口；服务正式重复部署链路、稳定心跳/可领取队列指标/最后成功告警；SCM恢复策略重新启用与受控重启证明；真实页面中文QA。整体P0未通过。

分析孤儿清理始终只读，与本次翻译授权无关，见v006。

## 停机期间离线验收清单

以下均未完成，不授权任何真实调用、数据库改动、部署或启动。

| 项目 | 状态与门禁 |
|---|---|
|解析纯测试|待补标准字符串、文本parts、Responses、Anthropic、两组usage字段；拒绝refusal/tool/image/自然语言/JSON数组。兼容改进不是首轮失败的已证实根因修复。|
|优先任务状态机|工作树已修非终态禁止普通消费，旧包未同步；待测非终态不消费、终态仅下一轮允许，已completed任务不重置/重领。|
|小批量边界|源XML仍batch5、已补backfill1；旧实际XML仍未补backfill1。batch1/backfill1目标契约待明确落实并测试，不能声称已生效。|
|预算attempts|工作树已补预算阻塞扣回本次attempt，旧包未同步；待mock验证SQL参数与owner/status/lease fence。|
|持久化预算|已有对象重建guard测试；待Repository mock最后额度条件UPDATE及UTC换日测试。|
|翻译队列指标/心跳|countTranslationJobs仍旧合同；可领取queueDepth应排除活动running与未到期retryable，lastSuccess/吞吐/存活告警待补。|
|显式安装/readiness|XML/render/status部分接入，不等于完整安装链路；待显式TranslationWorker target且All不含它，readiness只SELECT/SHOW。|
|运行包一致性|旧release不包含后续门禁修补；待manifest/入口hash与待部署源码匹配验证。|
|重新启动|以上离线门禁完成且取得新的启动授权后再评估；现在保持停机，不用parser改进触发真实重试或批量。|

首轮INVALID_RESPONSE无原始响应，不推断具体envelope根因。1491625已完成，无需任何操作。临时停机恢复策略仍需在获准启动前重新核验，整体P0未完成。
