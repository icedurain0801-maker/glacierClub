# 海外候选最终工程缺口与真实交付计划

Status: design-review / NOT_IMPLEMENTED / RUNTIME_NO_GO
Date: 2026-10-09
Owner: 开发负责人

## 当前证据与边界

候选16独立报告为 `.tests/2026-10/2026-10-09/v080_overseas_candidate16_recovery_independent_qa.md`：离线144/144、隔离SQL11/11主项及所列子矩阵通过。658文件前后hash一致。结论仅隔离局部恢复通过；pending分析/翻译队列不是已完成结果。候选16快照及旧失败证据不修改、不删除。

本计划回应项目经理最新派单。海外两步方案已经用户批准；以下新增持久账本与审计设计尚待确认，不是生产迁移、HTTP、账号刷新、切服务或发版许可。员工只读提出建议，负责人唯一落地。本文不修改经理待办 v033。

## 技术选择与推荐

1. 推荐：海外候选专属SQL任务账本，同页事务登记派生任务，精确绑定审计并原子结束。能证明“预期任务缺失”，但新增两张候选表，需验证事务规模与迁移边界。
2. 仅终态检查已有checkpoint：改动少，但不存在的任务无法被发现，中断后动态回复仍可能丢失，不满足本单完成判定。
3. 仅外部文件保存任务集合：保留文件证据，但文件与内容事务不原子，扩大提交未知恢复缝隙；本阶段不推荐。

## 一、固定范围与预期任务账本

候选迁移只新增 `po_overseas_stage_manifests`、`po_overseas_expected_tasks`，先在独立合成13316实例安装。不改变国内或普通checkpoint身份规则，不在生产跑DDL。

- manifest以每站独立run_id为主键，保存receipt/scope/代码manifest摘要、canonical schema descriptors及hash、历史封口、扩展封口、覆盖状态与原因、创建/更新epoch。
- task唯一身份覆盖run完整scope、site/window、task_kind/task_key/root；保存不可变descriptor/hash、schema/history/page/reply来源证据、checkpoint精确关联、expected/completed/failed/unsupported状态。
- schema发现是唯一bootstrap请求；完整feeds登记之前不派发feed/comments/replies。恢复再次发现schema仅用于一致性否决，增删改均partial/schema_drift，不删原pending任务。
- 历史扫描须在同一REPEATABLE READ事务内、同连接读取现有可信root证据、逐页登记，末页且coverageGaps=0才seal。MAX UUID或跨事务cursor不构成快照。事务有界；超预算rollback并partial，具体数量/时间上限在隔离规模测量后固定并记录，未固定前禁止真实启用。
- 当前run后来发现posts，由页面事务追加comments任务；comments页面的动态reply同样在页面commit之前登记。不能在onPageCommitted回调之后才写账本。
- context祖先不计业务任务产出；reply targets必须核真实root/parent、depth与sortType，不能接任意外部列表。
- 重启加载账本全部pending任务；completed checkpoint必须有本run账本关联和完成证据，不能借同site/window其他run checkpoint直接短路。
- 成功封口必须schema固定、history sealed、全部任务completed、scheduler与提交lane排空；terminal同事务锁run/manifest/tasks再次核checkpoint、cursor、scope。timeout/gap/unsupported/stall/schema drift只能partial。
- page登记与terminal共锁run，seal后禁止新增任务；不能worker判partial却audit/source仍记success。

建议文件：新增 `worker/src/overseasStageCoverage.js`、`server/src/db/overseasStageCoverage.js` 与候选迁移；修改candidate factory、PageStore、worker daily/syncStagePage/syncStage及Progress。候选能力需私有品牌，不接受复制对象或任意callback冒充。

成功口径仅为：固定授权schema声明feeds、固定时间窗、可信本地历史root快照和页面派生任务范围内穷尽。不证明权限隐藏feed、provider漏页/错误hasMore、上游未返回reply或board历史全集。

## 二、审计与统一持久计数

现 `repository.createRun(sourceId)` 没有run/epoch绑定；`createFinishOnce`先sync terminal再audit terminal，存在半完成缝隙。

新增候选专属 `server/src/db/overseasBoundAudit.js`：auditId由固定格式+runId+epoch的canonical hash确定；既有 `po_audit_events` 保存唯一绑定事件，包含audit/run/epoch/owner、完整scope、contractSHA与代码manifestSHA，绝不保存credential或请求正文。同ID逐字段一致，不用INSERT IGNORE隐藏冲突。

候选在leaseGuard启动及真实Journal准备通过后创建绑定audit，跳过提前普通createRun；prepare失败不能再制造无绑定running。普通平台保留原路径。terminal同连接锁精确run/绑定事件/audit，核账本后原子结束sync与audit；提交ACK未知仅只读reconcile，不普通finishRun补写。source回写需使用最终状态与版本fence，不能旧epoch覆盖新运行状态。

旧audit分类：bound_running、bound_terminal、binding_conflict、unbound_running_manual_review。缺绑定者不能凭source/时间邻近归属，不修改、删除、补绑定或伪造success。清理旧记录是独立精确证据与用户决定事项，不阻止新候选安全隔离研发。

新候选初次epoch与恢复epoch统一使用持久唯一run-content links计算discovered/stored（排除context祖先）；保留posts专用fetched/inserted/changed/unchanged，comments/replies按depth与父链分类，不强改现有sync_scope='comments'。

terminal确定性事件记录counterContractVersion、links集合hash、checkpoint/任务集合hash及各分类计数；Progress必须核版本及精确hash，不直接放宽旧epoch1。旧无版本终态继续明确COUNTER_CONTRACT_UNPROVEN。SUM(cp.items_fetched)包含跨feed重复/context，不等于唯一links，不能硬要求二者相等。若需完整抓取到去重关系证明，另需同页事务page证据，本计划不把现有CP聚合值当该证明。

## 三、下一候选验证与交接

优先真实事务测试：commit后中断仍保留动态任务；漏一expected任务不得success；schema漂移不删任务；历史gap/预算中断不seal；错run CP不能短路；恢复保cursor；page登记与terminal互斥；audit插入/结束故障全rollback；同source两run/同run两epoch不混；stale owner拒；ACK未知全匹配只读accepted；epoch1含评论/回复且重复feeds/context计数正确。普通国内及其他平台最小回归必做。

新代码未实现，不能沿用候选16PASS。实现后开发验证、独立新快照全hash与manifest、流转QA整批离线+合成SQL复跑，保留每个失败原始结果。候选17编号仅计划，不代表已冻结。

## 四、真实交付步骤（全部未执行）

| 顺序 | 实际动作与证据 | 当前门禁/影响 |
|---|---|---|
| 1 | 只读确认第一源 `081a16d2-5545-4afd-9c65-e04777e4540b` 自身account、board100017、三站config/registry、频率21600及不可变版本 | 既有只读结果不能当切换时现状；不输出凭据 |
| 2 | 在自身授权上下文有界验证三站schema/token/帖子动态/评论响应，记录脱敏签名及分流证据 | 真实HTTP及可能token exchange/刷新须具体用户决定；languageId差异测试不是真实分流证明；禁止借另一源凭据 |
| 3 | 新共享build内源路由与普通入口独占接线，验证manual与scheduled路径、receipt/Journal/恢复证据来源 | 当前factory仅隔离，普通buildDeps未激活；现manual parent=NULL合同不能直接接scheduled_site；此接线未实现/未QA |
| 4 | 冻结共享release完整闭包与hash，核实际服务XML/入口、旧release/env/SCM/PID基线、schema兼容与旧版本回退能力 | 不直接执行既有cutover脚本；脚本允许worker.js不证明新候选已接线；生产新表另需迁移计划/决定 |
| 5 | 停止新admission/定时与poll，等待已有run、lease续期、各scheduler/commitlane排空，再关闭pool；确认唯一旧消费者退出及文件锁释放 | 共享采集器切换会暂缓国内/其他平台新采集；worker.js main当前shutdown只有pool.end，并未证明全量drain；需要新入口接线和Windows实际验收 |
| 6 | 仅替换PublicOpinionWorker release/XML并启动一个消费者；核PID/starttime/buildhash/heartbeat/lease以及API、3001、DB连续性 | 项目经理说明确切窗口并取得决定；不得另起海外生产消费者；不动API/3001/DB服务；旧08:00窗口已取消 |
| 7 | 第一源固定窗口三站真实任务：schema→feeds/动态→历史与新增comments→reply→内容+jobs+cursor+任务账本同事务→穷尽/partial | 运行写任务/内容需要另行决定；每站独立manual不冒充父run；provider失败保partial |
| 8 | 由唯一既有/批准消费者消费本批精确content/job allowlist，核analysis/translation完成、版本/fingerprint与译文、失败/预算 | `overseasBigPlayerPageJobs.js`只入队；`translationWorker.runControlled`有scope入口但真实调用计费且可能补队列，不擅自运行；分析路径另核scope能力 |
| 9 | 核下一源调度槽实际scheduled_at/window/parent-child/站点结果，确认21600频率及源时区语义 | 21600只是频率不是确定墙钟槽；不能快进DB时间或手工run充当定时实证；当前scheduled合同缺口先实现 |
| 10 | 异常时停止候选admission并drain，保留内容/jobs/账本/Journal，恢复旧release/XML，仅启动一个旧消费者 | 回退不是删新数据；旧消费者可能领取新/过期run，必须先证明不兼容任务可隔离且不会被旧路径执行，否则保持单服务停止、人工处理 |

既有 `worker-only-cutover-transaction.js` 提供只操作Worker工件、失败回退和mutation-safety hook；实际控制器还需核SCM及API/3001观察，不把工件hash观察等同业务连续性。不得为本方案开启授权环境变量或执行Apply。

员工补核两个不能跳过的真实工程缺口：

- receipt/Journal/RecoveryIntent当前限定仓库根 `.temp`，仅隔离可信存储；生产必须另设计LocalService可写持久状态根、最小ACL、无reparse、备份/恢复与完整性，不能把临时目录直接称生产durable，也不能只改env绕过边界。
- `schedulerRepositoryAdapter.scheduleSlotAtomic`仍写board_id/site_url_snapshot等真实现状缺列；`adapter.inspectRuntimeSchema`也有这些必需列。旧schema PageStore局部通过不覆盖调度/readiness。需要明确选择经QA的兼容合同或独立生产迁移方案，未闭合前下一槽和运行readiness均不得GO。

## 五、第二源精确最小路径

目标 `8c690d6e-12ea-4ad3-b434-d941276c4906`：既有证据为缺board、config三站/registry仅旧一站且对齐0/3、自身一次401。401不证明特定board不可访问，更不允许复制首源board/account。

| 项目 | 必要动作 | 门禁 |
|---|---|---|
| 自身board | 从该源产品/运营定义和自身授权schema确认真实board及game/community关系 | board具体值待确认，未确认不写配置 |
| 三站registry | 输出旧site与三个目标site精确diff、URL/启用状态、引用旧run/CP/marker影响；候选先隔离QA | 真实变更采用版本CAS，保留旧证据，不删旧site/run；实际是否保留为disabled行需引用清单后决定 |
| 自身401 | 检查该account状态/期限和登录会话可用性，只报身份摘要；必要时用户自身重新授权或批准精确刷新 | 不输出token，不借首源account，不自动循环刷新；真实登录/刷新另决定 |
| 执行前检查 | 新board/config/registry/account一致后重新冻结证据，独立QA通过再走该源自身固定窗口 | 第一源通过不转移放行，第二源任务/HTTP/入库单独决定 |

## 剩余门禁（每项独立）

| 项目 | 能安全继续的工作 | 需要决定的精确事项 |
|---|---|---|
| 任务账本两表及候选hooks | 本设计确认后仅隔离实现/验证 | 当前技术设计确认；生产DDL不在此批准内 |
| 新审计绑定/epoch1规则 | 同上，旧无证记录明确阻断 | 清理旧audit如需要，另给精确ID/证据后决定 |
| 整批QA | 开发后冻结新候选流转 | 不需要重复旧巡检授权 |
| 共享真实入口及scheduled合同 | 只读设计、隔离实现与跨平台回归 | 架构确定后审具体接线，不借manual证明scheduled |
| 生产持久状态与readiness | 持久根/ACL/恢复及schema兼容设计、隔离验证 | 精确状态路径及生产ACL/迁移变更另决定；当前.temp不用于生产 |
| 真实三站HTTP授权证据 | 请求计划/脱敏字段审核 | 源、站点、请求数量/端点、刷新边界和窗口 |
| 唯一消费者切换与回退 | release/控制器隔离测试及影响说明 | 共享采集暂停窗口、精确release/SCM目标、回退条件 |
| AI/翻译完成 | 可设计精确job allowlist和结果核验 | 真调用provider/费用预算及唯一消费入口 |
| 第二源修复 | 精确引用与diff、合成QA | 自身board值、registry变更及重新授权动作 |
| 下一真实调度槽 | 静态与合成调度验证 | 真实运行放行后等待真实槽，不能人工模拟代替 |

## 本次变更记录

仅新增本设计与交付计划文件；业务代码、SQL、服务、配置、真实HTTP均未修改或执行。完成worker调度/PageStore/Repository/恢复模块及独立QA报告只读核对，员工任务集合与审计建议经负责人交叉审核。真实交付员工补核的持久状态根和调度/readiness缺列门禁已逐项追加。设计待确认；未实施测试不写PASS。本计划通过消息交项目经理，待确认后继续隔离落地。
