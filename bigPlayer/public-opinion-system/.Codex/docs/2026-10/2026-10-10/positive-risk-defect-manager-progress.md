# 正面内容风险回归缺陷：项目经理待办

状态：已接收，派开发定位与修复；不宣称已修复。

用户新增协作要求：任务多时由特邀开发总监安排开发员工分担，负责人负责拆分、审查、统一写入与冻结交付。员工优先以子代理承担明确子任务，不唤醒已退役旧员工聊天；独立QA仍归测试总监，生产权限不因分工扩大。已向开发总监转达执行。

依据：产品交接 defect-positive-content-in-attention.md 与已确认 v025 规则。positive 最终 normal，质量推荐独立；中性规则保持，负面规则按下方已确认新需求实施，不删除内容或历史。海外采集任务独立，旧负责人不唤醒。

| 待办 | 负责人 | 状态 |
|---|---|---|
| 核926937实际记录、运行构建及分析/缓存/写入路径，确定原因 | 特邀开发总监 | 已派单，待证据 |
| 修复实际分析写入及缓存复用路径，提供最小必要验证 | 特邀开发总监 | 待实现 |
| 只读统计存量positive+attention/urgent、关联告警，提出保留原结果及审计的精确纠偏方案 | 特邀开发总监 | 待方案；未执行生产数据修改 |
| 实际运行版本部署及存量纠偏 | 项目经理 | 待核范围、影响与授权；本交接不作为发版授权 |
| 独立验收926937、列表/卡片/概览一致及必要类型/地区回归 | 测试总监 | 已预交接，待候选 |

验收以实际接口和功能为准，不重跑无关矩阵，不以开发自测替代独立验收。尚未取得运行证据前，存量、旧构建、绕过路径均只是待确认原因。

开发诊断增量（待独立QA核收）：926937 实际为 positive/attention，light sentiment-v1；分析及缓存时间10/9 20:22:24，deep pending，无关联告警。开发报告现役 analysis worker 旧v055无归一化。已要求保留证据并修实际运行与缓存写入路径，不能只改工作树。经理已再次明确产品定稿授权，负面50%规则合入同候选，不等待或重复询问用户。

开发回执：已接收负面50%定稿，合入本候选。只读统计全部 po_analyses 正面风险冲突2182行，其中有效game连接1644行，另538行归属缺失待核；关联活动告警0。此为开发证据待独立核验，2182不能全称有效内容，也不是已纠偏数量。926869/926910/926895诊断与最小代码修复进行中，冻结后交QA；未执行生产切换、数据纠偏或通知。

## v058候选核收与实施准备

经理已完整读取v058交接及候选清单。最终候选candidate-8JLSfB交独立QA，QA正在隔离接口功能验收，未签PASS。309单测及前一候选开发隔离结果不替代最终独立验收。

开发证据：926869 score0.86/confidence0.96、926910 score0.80/confidence0.60均满足旧规则，不能归因低confidence；926869及926895分析指纹过期，须以当前正文重析。现役分析旧v055无归一化是已报告原因，QA待核。

动态存量快照：正面有效1644中指纹一致1606/过期38；负面>=0.50非urgent有效6359中一致6173/过期186，另孤立7603；负面<0.50非urgent有效1172中一致1149/过期23，另孤立688。过期合计247。已有活动负面告警15不是预计新增数。低分1149需语义判定，不全量升级；孤立行保留。

已要求开发准备可审查但不执行的生产切换/回退、只读dry-run与100批CAS审计纠偏工件，并确认排空真实机制、全写入消费者、审计容量、重析费用/范围与历史通知抑制。API/分析/共享Worker三包仅局部overlay，保留海外排除行；此前海外单次Worker重启例外不自动覆盖本次。生产变更与重析均尚未执行，须完成具体工件核收与适用授权判定。

## 独立QA退回：legacy普通咨询误升级

candidate-8JLSfB整体FAIL。QA在api/analysis/collection三运行候选均复现：negative/attention/score0.1/confidence1、正文“请问bug修复公告在哪看？”、缺gameComplaint时，legacy GAME_ISSUE_PATTERNS裸bug命中升级urgent/game_issue_upgrade，预期attention。显式gc=false咨询和虚构证据拒绝通过；冻结身份核验及隔离MariaDB/三包SQL/API通过不抵消该功能失败。QA自有必要用例30PASS/3FAIL，自建实例已关闭、13316释放。

已退开发做legacy缺语义标记路径最小修复，普通咨询/关键词不机械升级，保留明确低分真实故障投诉；重冻结后QA仅复验受影响场景，不重复无关已通过测试。未部署、未纠偏、未付费AI或采集。

QA原件：.tests/2026-10/2026-10-10/v053_risk_independent_cases.cjs；仓库根.temp/qa-v053-risk-cases-1791614373054.json；仓库根.temp/risk-isolated-db-MlYuHb/result.json。

## v059重冻结与生产工件核收

v059已重冻结，替代v058；候选状态仍为独立QA中。开发按用户分工安排员工准备单AnalysisWorker控制/回退和消费者/CAS审查，负责人统一集成。经理只读核对dry-run原件：状态 dry-run-only、productionChanged=false、SHA256 BDEA190F5F37B9112E012D77B96C83612F421F20F030DB29271586EE329A0B36；确定性候选7784（positive1602、negative6182），过期246、低分语义1149、孤立8829、缓存10164，审计估算22.43MiB、100条/批共78批。

生产HOLD保持：现有AnalysisWorker是活跃持久写入者，但shared和API的旧入队状态路径未完成与新分析规则的闭环，且历史重析通知抑制尚未证明。翻译release ACL拒读仅标待确认；旧Q1 Daily 02仍Enabled且历史路径失败，仅记录，不恢复、不停用。现阶段只能清单与预算准备，不能执行切换、入队、重析或回填。

独立QA v055最终回执：v060 candidate-xeQZCM在隔离范围 PASS。manifest SHA ad9cde6bd40a73a88acadb1b35ff3722dbc242d494a6bbd9c41b49f79cbb43af 与15文件、三套overlay一致；受影响复验48/48 PASS。普通入口/知识咨询不升urgent，真实低分明确故障仍urgent，positive优先、gc true/false、50%且confidence0均通过；既有v053三包SQL/API独立PASS保留且未重跑。v053/v054失败原件仍保留。该PASS不涵盖生产切换、真实样本纠偏、消费者并发事务栅栏、shared/API producer闭环或历史通知抑制，生产HOLD不变。

v066-r3为新的17文件实施组合候选，manifest SHA256为18b8d560d48e85e4b05dcef24640da966d6566294ed267f758f0ce84d1a97234，三包1218文件身份已列清，最终独立QA待进行。员工消费者真实隔离MariaDB16项PASS只覆盖既定消费者事务合同；新producer真实SQL/API验证进行中，不能替代API/shared生产覆盖。CRLF/apply跳过的早期工件保留但不使用。

生产NO-GO明确保持：正文变化且活跃旧任务保留后的精确补队尚无受限方案；现役API/shared未切换；旧Q1 Daily02仍Enabled且可能写入；translation现役代码ACL未解决；实时告警外发仍有事务窗口；国内/海外实际采集恢复验证和存量纠偏均未执行。来源v065的隔离PASS不改变上述结论。

开发员工的新producer开发隔离证据已只读核实：v066-r3身份不变，1218文件一致；真实独立MariaDB与loopback app.js共21项PASS，含API/shared历史409、正常202、真实内容锁交错与事务回滚，SQL/HTTP端口均释放，没有AI、生产或外网。该结果状态为PASS_DEVELOPMENT_ISOLATED，已通知测试总监开展独立新增验收；它不覆盖正文精确补队、现役切换、Q1、translation ACL、实时通知窗口或线上采集恢复。

独立QA v058已完成v066-r3受影响范围验收，结论 PASS_INDEPENDENT_ISOLATED_AFFECTED_SCOPE：37项行为加1项身份检查通过，manifest SHA 18b8d560d48e85e4b05dcef24640da966d6566294ed267f758f0ce84d1a97234、三运行树1218文件及17个变更均匹配。范围含API/shared安全入队、真实HTTP409/202、正文变化时consumer commit/fail栅栏、历史deep原子性/继承、三AlertEngine历史静默、缺方法fail-closed和两种真实锁交错。首轮过严configured断言已纠正，续跑开关隔离环境清理导致的重复通过项已修runner；均无AI/生产写入。该QA不覆盖精确补队、loaded producer、旧Q1、translation ACL、实时通知窗口或线上恢复；生产NO-GO不变。

独立QA v059完成v069非历史精确补队/repair新增验收，结论 PASS_INDEPENDENT_ISOLATED_PARTIAL_SCOPE：完整候选1221文件、manifest SHA a581eb6bd19836f3e48e61476a7afba3d79b993c22b1a217cbc4ff4002ab5844 与schema SHA 0475046d63a3f1f7ecf7f87541a72f0484f2373258ddb934eeb569114d99a1de均核对一致；24个唯一执行场景通过。范围覆盖正文/intent同事务回滚、F1/F2旧结果拒绝、lease/NULL lease、reviewed fullCAS、gate断连回滚、死锁有界重试、F2/F3锁等待与ACK、恢复、scope/disabled/communityNULL、历史保护及HTTP409/202。旧fixture/断言问题经定向修复后续验，既有通过项未重跑。该PASS不涵盖locked affectedRows0、requestId、history lane、datewindow、Q1、loadedproducer、translation、实时通知、生产schema或线上恢复；海外overlay不得沿用该结论。

海外v072 producer overlay独立验收已收口，结论 PASS_INDEPENDENT_ISOLATED_OVERSEAS_PARTIAL_SCOPE：409文件、2份隔离schema/4张新增表和8项改动身份匹配，actual daily/fused Repository/PageJobs直接范围16/16通过，真实锁timeout同页重试与COMMIT成功后模拟ACK异常不重试均核实，隔离SQL端口已释放。v072不再补开发/测试、不重三站、不扩translation/Q1/historylane。唯一遗留生产边界为translation active整页回滚、海外消费者实际加载/回放、旧Q1 split writer、通知窗口、生产schema/精确范围与线上采集验收；这些保持单列NO-GO，不因HOLD自动添加新范围。

## 负面待处理分层补充交接

依据：feature-negative-pending-lower-threshold.md 已为 user-confirmed-ready-for-project-manager。产品补充交接确认用户已弹窗拍板：positive→normal 优先；negative 明确游戏玩法/机制/公平性/匹配/奖励概率/bug/服务投诉直接 urgent，不另加分数或 confidence 门槛；其他 negativeScore≥0.50 为 urgent，confidence 不阻挡；低于0.50且无明确需处理问题为 attention；已有 urgent 不降级；中性沿用既有规则。普通咨询、单纯关键词不能机械升级。本定稿替代上一条待选择状态与原先不改负面阈值限制。

| 待办 | 负责人 | 状态 |
|---|---|---|
| 只读核926869、926910全文、sentiment/score/confidence/final severity、运行构建、写入与缓存路径 | 特邀开发总监 | 已补派，待事实；不预断confidence为原因 |
| 核既有游戏投诉规则实际执行及必要修复范围 | 特邀开发总监 | 待定位，沿既有规则，不实施新阈值 |
| 新通用阈值选择 | 产品经理/用户 | 已确认，采用50%且confidence不阻挡 |
| 同版本模型/归一化/轻深缓存写入接线与存量纠偏方案 | 特邀开发总监 | 已派定稿，待实现及精确影响范围 |
| 独立验证926869/926910、0.499/0.500/0.501、低confidence、926895全文、正面926937/926923及集合计数一致 | 测试总监 | 已派定稿，待候选 |

不调整中性口径或抓取调度；历史纠偏不自动补发外部通知；不以UI变化替代轻深分析、缓存、持久化、列表和概览的实际一致性。
