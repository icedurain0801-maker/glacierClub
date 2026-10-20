# v016 Last Light 共用海外采集流程

Status: 已发布，真实三语采集验收完成
Date: 2026-10-15

## 目标与实施

Last Light 与 X-Clash 共用 BigPlayer H5 Worker 的语种发现、帖子、评论、回复、断点和分析规则快照流程。账号、社区范围、站点队列与断点仍独立。移除 Last Light 的专用排除条件，停用旧专用计划任务及写入 STOP，保留原数据、任务、receipt 和回滚包。

当前 Worker：`C:/ProgramData/PublicOpinion/releases/release-20261015-shared-overseas-v6`。
增量基底：`release-20261015-ai-policy-debug-worker-1792026628293`。API、前端未切换、未重启。不能以工作区整体覆盖现役包，实际数据库尚无 030 的版块列。

## 代码逻辑和文件

- `shared/overseasCommentIntegrity.js`：校验 source/account/game/community/board 与根父图；缺标记只能在证据充分时 CAS 补元数据，真冲突拒绝；按 ID 去重根/父对象，正文、指纹与已有分析不变。
- `worker/src/sharedOverseasCommentTargets.js`：已知语种按 membership 分流；无历史语种归属的根在同账号按全局 postId 探测一次，不猜测或写入语种归属；恢复 pending 回复断点。
- `worker/src/worker.js`、`worker/src/workerScanLease.js`、`server/src/db/repository.js`：共享入口接线，海外旧帖正文未变化仍检查新评论；窗口外父评论保留为上下文、回复按自身时间过滤；手动三语子任务汇总；UTC 时间解析；分析查询补 raw_payload；checkpoint 整事务对死锁/锁等待做有限重试；排队和账号占用不当毒任务。
- `scripts/windows-services/source-check-runner.js`、`sync-source-check-tasks.ps1`：恢复操作走通用三语准入，不再启动旧专用采集器。
- `scripts/prepare-shared-overseas-runtime.cjs`：以现役基底增量生成兼容运行包，严格校验替换上下文。
- `scripts/migrate-shared-overseas-checkpoints.cjs`：幂等、有审计的旧评论断点迁移；未知游标不转换，不删除旧 receipt。
- `worker/test/sharedOverseasCollection.test.js`：历史父图、范围隔离、CAS、语种分流、游标兼容、死锁重试、策略查询与手动汇总回归。

## 断点与真实操作

旧手动父任务 `b3b281c9-4007-4eb7-a2ca-51be0daefe10` 的 130 个评论断点迁移成功：101 completed、29 idle。旧帖子 opaque cursor 不转换，帖子阶段重新有界读取。迁移 journalKey 为 `53c5658180a2e1173c69a54e64f5ff18fe836ca80d7610ba5ee65aee7437f421`。

最新滚动父任务 `3ce7989a-5f04-46ab-b5e1-a22deb418ed3`：北京时间 10/14 00:00 至 10/15 10:33。英语大批量创建断点出现 3 次死锁，保留错误证据并审计后只重排该子任务，保留已有断点。

历史恢复父任务 `b59e1998-89c7-4452-a5cc-db0fdf974a7d`：北京时间 10/13 全天，backfill，已确认 bounded window 进入 runDailyQ1Collection。与最新滚动任务联合覆盖旧自动任务 `72feb10f-6ac4-5b14-a6d6-c9c022417a33` 的窗口，保留旧失败状态，不伪造成功。

本轮关联的 28 个非 running 分析任务补入内容原有策略快照后重排；要求 fingerprint 匹配。无结构迁移、无删除。

## 验证

- 实际 v5 模块的 sharedOverseasCollection + workerScanLease：21/21。
- 实际连接器评论与语种测试：14/14；退休专用 collector 的 60 秒 deadline 测试不适用于通用 resolver，明确排除。
- Worker 428 文件 manifest、依赖路径与 SHA256 校验通过。
- 相关语法和 git diff --check 通过。
- 广泛 scheduler 旧合同回归：基底 9 项失败，候选 8 项失败；8 项属于工作区测试与旧运行包合同差异，未新增失败，不能宣称全量通过。
- X-Clash 最近父任务 completed，stored_count=2073，三语子任务无错误码；本轮没有额外提交 X-Clash 采集。
- BaaS 每分钟同步任务运行，10:56 状态 success；最终任务终态仍待同步后验收。

## 风险与回滚

历史恢复及英语重试均已完成。3813698 及旧回复发表于 10/8，本轮没有新回复触发其父链；其精确场景通过单元测试，未宣称真实改写。原帖 1585828 的另一父评论 3817548 已补标记，10/12 回复 3869633 已入库。连续两轮 6 小时自动采集尚未验证，不声称长期稳定。

回滚 Worker 使用原基底并保留新断点和审计记录。若需恢复旧专用采集器，必须先停止通用入口对此来源的准入并确认进程/命名锁释放，禁止两套采集器同时运行。

证据目录：`.tests/2026-10/2026-10-15/`，主要为 shared-final-live.json、shared-overseas-live-progress.json、shared-checkpoint-handoff.json、shared-recovery-submission.json、shared-policy-repair-before.json、shared-runtime-regression-baseline.txt、shared-runtime-regression-candidate.txt。


## 最终验收（北京时间 2026-10-15 11:16）

- 已切换 v6，服务 Running。v6 仅在 v5 基础上补充终态计数单调保留，避免已完成断点重试后清零；21 项运行包测试和 428 文件 manifest 再次通过。实际 SQL 引擎只读验证旧值113与新值0/5/120/null分别得到113/113/120/113。
- 最新父 3ce7989a… 与历史父 b59e1998… 均 completed，6 个三语子任务全部 completed_authorized_scope，error_code/error_message 均为空。
- 最新父累计 discovered=166、stored=146；历史父 discovered=267、stored=243。计数为采集处理次数，不等同不同内容数。
- 旧分支完成时覆盖掉最新英语累计计数，已按03:00:29 UTC保留的真实数据库快照恢复133/113并汇总父任务。有事务审计，无内容/终态改动。分页 fetched/inserted/changed 只覆盖部分通路，不可作为完整评论计数；最初 ledger 修正不足，已追加快照修正并保留两次审计证据。
- 历史窗口最终评论根2066、feed61、reply25，均 completed，无 idle/running 断点。滚动窗口英语/韩语/日语均有帖子和评论，英语/韩语有楼中楼回复，日语窗口没有回复结果，不伪造回复数据。
- run_contents 按父任务精确关联：最新32篇帖子、154条评论（含11条楼中楼）；历史36篇帖子、158条评论（含6条楼中楼）。关联集合用于验收，不将重复处理次数当新增内容。
- 本轮关联轻量分析370 completed、3 failed，373条均有策略快照。另1条历史deep分析已完成但无快照，保留历史状态。失败3条为EXPLANATION_INVALID_RESPONSE/EXPLANATION_LANGUAGE_INVALID，属于模型输出错误，未宣称分析全成功。
- BaaS 11:16同步status=success，线上任务最终状态另见页面截图证据。
- 保留连续两轮6小时自动运行尚未验证的限制。
