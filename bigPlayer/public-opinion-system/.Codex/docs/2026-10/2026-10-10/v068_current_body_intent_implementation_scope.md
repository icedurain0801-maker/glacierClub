---
last_updated: 2026-10-10
status: independent-isolated-partial-scope-pass
owner: 开发负责人
---

# 当前正文延期意图与精确回放实施范围

经理已明确派单，仅隔离实现与验证。生产HOLD，不启动shared，不生产迁移/写库/回填/重析/入队/通知。v060规则、v065来源和v066已过范围不重跑。v066独立37行为+1身份检查PASS只覆盖此前事务和producer受影响范围。

## 目标反例

正文F2在旧任务F1 running时提交，旧owner保留，claim/commit/fail双指纹防护拒绝旧结果。目前延期入队意图未持久化，后续unchanged采集可能不再补队。新增候选须保证正文与延期意图一起提交，限定精确scope和批大小回放，不能靠下游内存计数或全库扫描。

## 已派执行

| 工作 | 执行者 | 交付位置（仓库根） | 状态 |
|---|---|---|---|
| 持久intent/schema、正文同事务实际接线、精确repair/replay | 实现员工 | `.temp/risk-normalization-20261010/employee-intent-implementation/` | 执行中 |
| 21项可证伪fresh SQL/API对抗与生命周期 | SQL员工 | `.temp/risk-normalization-20261010/employee-intent-sql/` | 准备中，稳定身份后执行 |
| scope/lease/CAS/代次/schema与回退审查 | 审查员工 | `.temp/risk-normalization-20261010/employee-intent-review/` | 等实现稳定后审查 |
| 串行集成、冻结manifest及交独立QA | 开发负责人 | 正式新候选索引待生成 | 未完成 |
| 生产实施与国内/海外实际采集验收 | 经理控制门禁、独立QA | 独立范围 | HOLD，未执行 |

## 不可省略的实现合同

- 默认禁用，启用须精确source/game/community/account/region/profile/version白名单及batch上限不超过10；没有scope不得全局回放。
- collection正文page与独立insert入口必须分别核覆盖。延期intent在正文同连接事务写入，进程在正文commit后、downstream前退出仍可恢复；未覆盖入口明确列出，不以helper存在冒称全链。
- active owner或未来lease保留；samefp非NULL过期running已有claim不回归；NULLlease和stale expired running用明确名单、完整旧身份CAS与真实writer drain门禁处理，不能按年龄推定安全。
- repair在持po-analysis-consumer的同连接事务完成，content→job→analysis/intent顺序核精确ID、old/newfp、scope和完整旧job身份，audit失败/失锁断连全回滚。
- F2/F3意图代次与ACK保护，重复回放幂等；普通ensure-current不能吞同fp显式force，activeforce继续409。
- 历史单槽一律保护marker/provenance，遇历史冲突显式deferred_history；未审核代次迁移不把历史槽擦成普通任务。
- schema只作为隔离正式候选工件，不生产执行；写清唯一键/索引/FK、回退后仍需保留intent及不可逆边界，禁止DROP已有意图掩盖恢复需求。

原方案参考：仓库根 `.temp/risk-normalization-20261010/employee-current-body-plan/report.md`。21项对抗是待执行清单，不能当已通过。旧Q1潜在writer、loadedAPI/shared覆盖、translationACL、实时通知窗口和线上恢复仍分别NO-GO。

## 本轮开发收件（2026-10-10）

实现与只读审查已收齐，员工冻结 129 文件部分树 SHA `53bb915ee109169d4d4d8781c1cf5c287f03b5aba6dbfe28f9a5a68f423beb31`；主代理从完整 v066-r3 串行整合 9 项变化，得到完整 v069 的 1221 文件。新 manifest SHA `a581eb6bd19836f3e48e61476a7afba3d79b993c22b1a217cbc4ff4002ab5844`。

开发实际 SQL/API 27 项首轮 + 真 deadlock 1 项 + community NULL 2 项，共 30 执行场景通过。原 21 项逐条证据、未实现的 force requestId/history lane/日期窗口、未实证 affectedRows=0 与旧 Q1 NO-GO 都列在 `v070_current_body_intent_development_handoff.md`；不是 21 全 PASS。自建实例均核身份关闭、端口释放。

正式索引 `v069_current_body_intent_candidate_manifest.json` 已发送经理与独立测试，独立测试已开始新增范围验收。上表为原派单状态留档，以此收件更新为当前状态：开发完成、主代理冻结完成、独立 QA 进行中；生产实施仍 HOLD。经理唯一正式待办不由本文件代写。

最终独立收件：v059 QA 24 个唯一执行场景通过，`PASS_INDEPENDENT_ISOLATED_PARTIAL_SCOPE`，完整1221文件身份不变，三轮自建SQL/HTTP已核身份关闭释放。以 `v070` 的“独立 QA 最终收件”与 `.tests/2026-10/2026-10-10/v059_current_intent_independent_qa.md` 为当前结论；原21全量/海外writer/其他生产NO-GO不被覆盖。
