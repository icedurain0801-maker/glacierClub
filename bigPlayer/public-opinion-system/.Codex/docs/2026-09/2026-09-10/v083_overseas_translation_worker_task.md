---
last_updated: 2026-09-10
status: p1_runtime_blocked
scope: overseas-translation-worker-recovery
owner: 项目经理
source_design: docs/superpowers/specs/2026-09-10-overseas-translation-worker-design.md
---

# v083 境外内容中文翻译失败恢复任务单

## 已拍板范围

- 保持既有采集与 AI 分析链路不变，只补独立翻译队列消费者。
- 消费 `po_translation_jobs`，将成功译文写入 `po_content_translations`，供内容详情展示。
- 可恢复错误进入退避重试；达到最大尝试或配置错误进入最终失败；未启用时不领取任务。
- 启动及扫描时补入缺失的境外翻译任务，覆盖既有积压。
- 开发负责人为工作树唯一业务写入者；已由并行会话产生的翻译变更必须原样审查接管，不得回滚或覆盖。

## 待办

| 状态 | 优先级 | 事项 | 负责人 |
|---|---|---|---|
| done | P0 | 审查并接管已有翻译模块/worker 变更，补齐租约栅栏的译文写入与任务完成原子事务，完成定向测试 | 开发负责人 |
| done | P0 | 独立回归任务状态、租约、退避、最终失败、积压回填与详情译文存储/可见性 | 测试负责人 |
| done | P1 | 常驻翻译 Worker 的运行环境脱敏准入：配置、URL/模型、额度与积压费用核对；结论 NOT_ADMITTED | 开发负责人 |
| done | P1 | 翻译运行环境修复方案：模型、TLS、安全凭据健康和额度合同；无占位符变更/回滚单已就绪 | 开发负责人 |
| pending_external | P1 | AI 网关资产：精确模型 ID、Token active/scope/expiry/model access、RPM/TPM/额度/价格 | AI 网关负责人（待指派） |
| pending_external | P1 | 运维变更：恢复 TLS 校验、独立 translation URL/Token/model 配置、受影响进程有序重启 | 主机运维（待指派） |
| pending | P1 | 单任务真实翻译 -> DB -> 详情页面受控验收（batch=1、上游请求=1、禁止重试） | 开发负责人 + 测试负责人 |
| pending | P1 | 积压分批回填计划、日预算、限流、可观测性与回滚门禁 | 开发负责人 |
| pending | P1 | 常规 due/manual 来源实时入队的 `region_code` 透传缺口，避免入队延迟 | 后续排期 |

## 现有变更交接

原并行会话已停止业务写入。开发负责人须仅审查并接管以下未跟踪文件：

- `docs/superpowers/specs/2026-09-10-overseas-translation-worker-design.md`
- `server/src/integrations/aiTranslator.js`
- `server/test/aiTranslator.test.js`
- `worker/src/translationWorker.js`
- `worker/test/translationWorker.test.js`

`worker/src/worker.js` 为既有已修改文件，不属于该会话本轮变更，接管时不得将其归入翻译实现或覆盖。

原会话自检：定向 `7/7 PASS`，server/worker 全量测试末段 `168/168 PASS`。该结果待开发负责人复核，不能替代独立测试验收。

## 部署边界

当前不得启动翻译 Worker、回填积压或调用外部翻译服务。运行环境阶段需先做脱敏配置健康核对，并评估积压任务的预期调用量/费用及限流；`AI_TRANSLATION_ENABLED=true` 本身不证明 URL、Token、模型或上游可用。

## 租约原子性补充派单（2026-09-10）

开发负责人接管审查发现：现有流程先 upsert 译文、后 finish 任务。若旧 Worker 的 lease 已过期且新 Worker 已重新认领，旧 Worker 仍可能写入并覆盖新 Worker 的译文，违反“并发 worker 不覆盖彼此租约结果”门禁。

本任务范围扩展仅限：

- `server/src/db/repository.js`：新增或调整一个以任务 ID、lease owner、lease 有效期为栅栏的原子完成方法，在同一事务内持久化译文并将任务置为完成。
- `server/test/translationRepository.test.js`：新增仓储合同测试，覆盖有效 lease 成功、过期/错误 owner 不写译文且不完成、并发重新认领后旧 owner 不覆盖。
- 翻译 Worker 仅调用该原子方法；`worker/src/worker.js` 保持既有文件，不得混入。

不得扩大到 schema 迁移、真实 Worker、真实回填、外部翻译调用、采集/分析/Facebook 链路或提交/发布。

## 开发返件（2026-09-10）

开发负责人已完成实现与本地审查，当前流转测试负责人独立验收：

- 翻译模块、独立 Worker、仓储原子完成 hunk、翻译/仓储合同测试及既有 `start:translation` 入口均已接管。
- `worker/src/worker.js` 未修改。
- 开发验证：定向 `21/21 PASS`、Server `331/331 PASS`、Worker `173/173 PASS`，语法与 diff 检查通过。
- 未启动真实 Worker、回填或外部翻译调用，未改真实配置、提交、push、合并或发版。

实现记录：`.Codex/docs/2026-09/2026-09-10/v084_overseas_translation_worker_implementation.md`。

## P0 独立验收（2026-09-10）

测试负责人结论：P0 PASS，缺陷 0；仅准入 P1 运行环境验收，不代表真实翻译服务、真实 DB 落库或页面闭环通过。

- 定向：`21/21 PASS`。
- HTTP 408 补充盲测：`1/1 PASS`。
- Server：`331/331 PASS`。
- Worker：`173/173 PASS`。
- 语法：`6/6 PASS`，diff 检查通过。
- 测试负责人随后独立实际复跑最小集：`node --test --test-concurrency=1 server/test/translationRepository.test.js worker/test/translationWorker.test.js`，`13/13 PASS`、`0 FAIL`、`0 skipped`，约 660ms。

测试报告：`.tests/2026-09/2026-09-10/v085_overseas_translation_worker_regression.md`。

## P1 运行环境准入（2026-09-10）

开发负责人只读脱敏核对结论：`NOT_ADMITTED`。未启动 Worker、未外呼、未写 DB 或改真实配置。

| 项目 | 结论 |
|---|---|
| 配置键/HTTPS 端点/凭据存在 | PASS（仅存在性） |
| 翻译模型 | FAIL：`P1_TRANSLATION_MODEL_MISSING` |
| TLS | FAIL：`P1_TLS_VERIFICATION_DISABLED`，全局 Node TLS 校验被关闭 |
| 凭据运行态 | UNKNOWN：`P1_TRANSLATION_CREDENTIAL_UNVERIFIED` |
| 额度/限流 | UNKNOWN：`P1_TRANSLATION_QUOTA_UNKNOWN` |
| 积压风险 | HIGH：境外有效内容 10,092、缺译文 9,303、pending 71、retryable 9,142（到期 9,140，均 `DAILY_LIMIT`） |

单进程每日 1,000 次的理想上限下，当前积压至少约 10 天；不得直接启用常驻 Worker 或批量回填。运行环境修复后，只允许单任务真实验收通过，再制定有预算的分批回填计划。

准入记录：`.Codex/docs/2026-09/2026-09-10/v086_overseas_translation_runtime_admission.md`。

## P1 运行变更单（2026-09-10）

开发负责人已完成无占位符的精确变更/回滚单，当前仍 `NOT_ADMITTED`。变更单：`.Codex/docs/2026-09/2026-09-10/v087_overseas_translation_runtime_change_plan.md`。

项目经理已将真实验收预算收敛为：仅 1 个任务、仅 1 次上游翻译请求、禁止重试与批量回填。该限制不代表已获模型授权或已知费用；精确模型、Token 权限、额度与价格仍须由 AI 网关负责人经安全渠道确认。

运行环境事实：翻译器仅读取 `AI_TRANSLATION_MODEL` 后回退 `AI_ANALYSIS_MODEL`，两者当前均缺失；历史 `AI_ANALYSIS_LIGHT_MODEL=gpt-4.1-mini` 不可视为翻译模型授权。根 `.env` 的 TLS 禁用影响 server、worker、analysis-worker 及 future translation-worker，必须由运维恢复校验后有序重启。

## 验收门禁

1. 有效境外翻译任务成功领取、翻译持久化、任务 `completed`，详情 API/页面可读到译文。
2. 超时、限流、服务端错误等可恢复错误进入 `retryable` 并遵守退避；超过最大次数进入 `failed`。
3. 未启用或未配置翻译服务时不领取/不消耗任务，不产生无限运行状态。
4. 启动与扫描均能补入缺失的境外任务；并发 worker 不覆盖彼此租约结果。
5. 不输出原文以外的凭据、翻译服务秘密或授权头；不修改采集、分析及 Facebook 链路。

## 流转

开发负责人完成本地审查、实现记录和可执行最小验证命令后交测试负责人独立复验。mock 可用于单元/合同测试，但不能替代真实翻译持久化与详情可见性合同；未授权提交、push、合并或发版。
