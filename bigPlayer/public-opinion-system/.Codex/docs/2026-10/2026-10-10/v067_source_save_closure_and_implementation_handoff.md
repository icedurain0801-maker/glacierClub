---
last_updated: 2026-10-10
status: implementation-candidate-review
owner: 开发负责人
---

# 来源保存缺陷收口与事务实施候选交接

生产 HOLD。本文件记录隔离候选交付，未重启服务、生产写库、入队、回填、重析、通知、push或发版。

## 来源 v065

首次根因是创建草稿切换账密时进入已有来源管理渲染，草稿无真实 ID却可触发已有来源检测。已分开创建/编辑渲染、保护真实 sourceId、保留非敏感输入、处理404并阻断重复无效操作。创建结果未知时要求列表确认，避免重复 POST。

独立 QA v056又发现旧保存 PATCH迟到会关闭新开的创建草稿。v065已对成功/失败回包核 requestSerial、sourceId、scope epoch、community/region；仅仍属于当前页面才关闭抽屉、提示或标记过期。TapTap关键词在PATCH前冻结，继续原请求的community PUT，不读取后来草稿DOM。

- 业务：`../admin/PublicOpinion/assets/sources.js`、`../admin/PublicOpinion/sources.html`，资源引用v211。
- 测试：`.tests/2026-10/2026-10-10/source-draft-lifecycle.test.cjs`，11/11；原source-status24/24，开发员工保存定向10/10。
- 冻结：`v065_source_draft_candidate_manifest.json`。
- 独立复验：`.tests/2026-10/2026-10-10/v057_source_save_independent_recheck.md`，15/15 PASS，`PASS_ISOLATED_CANDIDATE_FUNCTION`。保留v063八项PASS、v064 malformed201 PASS与旧FAIL，不重风险。
- 浏览器：开发前一隔离fixture验证创建/管理/同ID检测与账号往返；本次保存修复的独立证据是VM，真实浏览器及线上验收未签PASS。

## 事务实施 v066

正式索引：`v066_risk_implementation_candidate_manifest.json`。最终目录在仓库根 `.temp/risk-normalization-20261010/candidate-implementation-v066-r3/`，manifest SHA256：`18b8d560d48e85e4b05dcef24640da966d6566294ed267f758f0ce84d1a97234`。三包共1218文件，17个文件相对v060改变；v060风险normalizer原SHA保持。不是覆盖v060，也未整包覆盖业务源码。

合成包含普通AnalysisWorker正文/任务双指纹、owner/lease/attempt/profile/version栅栏；结果/缓存/quality/审计/positive-only告警关闭/deep入队/finish同连接事务；历史deep在parent finish前借连接并继承可信marker；三个AlertEngine入口历史静默；API/shared/analysis普通入队保护活跃租约和历史marker；API force冲突409；缺事务方法明确报错，不回退旧写入。

开发员工消费者真实隔离MariaDB16项PASS，完整事务回滚与两种真实行锁交错有证据，范围是前驱consumer精确SHA；旧producer危险SQL由fixture模拟，不能冒称新API/shared验证。员工消费者mock30项、producer mock21项、worker fail-closed实际导出VM20项PASS。新组合17文件语法通过；新producer真实SQL/API验证员工执行中，最终独立QA未完成。不重复v060已过规则矩阵。

主代理组合核验 `verify-implementation-v066.cjs` / `v066-integration-verification.json`：1218项SHA全部匹配；6个leased关键方法与真实SQL前驱逐字一致（仅忽略CRLF差异）；三个AlertEngine各两入口、content/analysis各带marker的12次实际调用均提前返回且无side effect。此核验是开发集成证据，非独立QA/实库证据。来源临时内存fixture已停止，52634端口无监听。

构建尝试的混合CRLF补丁边界失败原件保留：`candidate-implementation-v066`、`-r1`、`-r2`均不具资格，r1 git在祖先仓库子目录跳过部分patch。最终r3逐项核员工目标SHA，拷贝限定目标到新隔离runtime后再按路径集成；清单对比1218文件，明确17个改变。不能把git apply退出0单独当完成证据。

## 尚未完成的实施边界

| 工作 | 状态与交付责任 |
|---|---|
| 新producer真实SQL与API冲突验收 | 开发员工21项PASS；真实loopback handler409/202与两种content行锁等待，实例已关闭；已补交独立QA |
| 新组合消费者/历史/producer独立QA | v058 独立受影响范围37行为+1身份检查PASS，不沿用v060 PASS；生产阻断不关闭 |
| 正文变化时活跃旧任务保留后的精确补队 | 员工只读方案已交；代码未实现，当前helper不会自动补新指纹，须单独受限方案与验证 |
| 现役API/shared覆盖 | 未执行服务切换；仅切AnalysisWorker不能闭环，shared仍无重启授权 |
| Q1 Daily02潜在writer | Enabled=true，事务栅栏未覆盖；不能称已停用 |
| translation现役源码核查 | ACL拒读，仍待确认，不能根据工作树推断 |
| realtime告警外发版本竞争 | 独立事务窗口仍存在；本候选只保证历史静默与结果事务 |
| 生产数据纠偏及国内/海外实际采集验收 | HOLD，未执行，不能称境外同步恢复 |

经理唯一维护待办与发版。本文件是开发交接记录，不更改经理待办或生产授权。

新producer证据补齐：仓库根 `.temp/risk-normalization-20261010/employee-producer-sql/report.md`、`run.cjs`、`run-fUABUa/result.json`。21个检查包含19项行为、实例身份及消费者方法一致性；API/shared各8项实际Repository SQL，历史helper借外层事务回滚，真实app handler running/history分别409，正常force202，consumer提交后force不被吞、shared后API force按content/job锁序保留后来请求。全部1218SHA前后一致，SQL62561/HTTP62587已释放。未重旧消费者16项，未调用AI/生产。独立QA待执行。

当前正文只读方案：仓库根 `.temp/risk-normalization-20261010/employee-current-body-plan/report.md`。确认F2正文提交、旧running任务F1、producer保留活跃owner、claim/commit/fail双指纹拒绝、无持久延期意图的滞留反例。相同指纹且非NULL过期租约的running已有claim恢复路径，不能概括为全部过期任务永久卡住。NULL lease与指纹不一致需专门准入。方案拆为非历史精确名单repair、持久当前正文intent及有界回放、历史单槽代次保留；21项SQL/API是待验清单，非已通过。worker enqueueOnly的changed.length计数未核真实enqueueDisposition，也不能当实际入队数。方案已交经理核收，未实施、未迁移、未扫生产数据。

v058独立验收已收：`.tests/2026-10/2026-10-10/v058_risk_implementation_independent_qa.md`，`PASS_INDEPENDENT_ISOLATED_AFFECTED_SCOPE`，37行为+1身份检查通过。独立原件在仓库根 `.temp/qa-v058-risk-IFSqfV/result.json` 和两项engine锁证据；首轮过严backlog configured断言与续跑开关被清理造成的重复记录保留。1218项SHA前后不变，37项仅覆盖安全producer/API、consumer正文变化拒写、历史原子/静默、缺方法无回退与真实锁交错；不重规则/来源或原16全部矩阵。SQL实证当前正文补队缺失，生产NO-GO仍成立。

经理已明确派单下一补队隔离实施：实现员工 `employee-intent-implementation` 与SQL/API对抗员工 `employee-intent-sql`，开发负责人串行审查集成。持久intent/schema与实际正文同事务接线、有界精确repair/replay、21项可证伪SQL/API原件均须新候选冻结后交独立QA。此派单只允许隔离实现验证，不解除生产HOLD。

后续收件：非历史正文持久 intent/精确 repair 已实施为完整 v069 候选，1221 文件、9 项变化，manifest SHA `a581eb6bd19836f3e48e61476a7afba3d79b993c22b1a217cbc4ff4002ab5844`。员工真实 SQL/API 30 个执行场景与只读审查通过受影响开发范围，完整原 21 项证据/未实现项见 `v070_current_body_intent_development_handoff.md`。上文“尚未实现”的描述为 v066 阶段记录，当前开发已完成，独立 QA 已收到新冻结包并开始；未签独立通过或生产恢复。旧 Q1/loaded producer/translation/通知及生产门禁保持。
