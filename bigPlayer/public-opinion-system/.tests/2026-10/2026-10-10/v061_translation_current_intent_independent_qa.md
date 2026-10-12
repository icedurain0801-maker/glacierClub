# v061：v075-r2 翻译 current intent 独立定向验收

日期：2026-10-10。结论：**PASS_INDEPENDENT_ISOLATED_TRANSLATION_PARTIAL_SCOPE，8/8 通过；生产继续 HOLD。**

独立测试负责人执行实际海外 page producer、translation consumer、translationWorker 入口；开发自测不代签。本轮仅验 v075-r2 翻译 active 与正文更新最小闭环及直接影响边界，不复跑已通过来源、风险、海外采集矩阵。

## 冻结身份

- 项目索引：`.Codex/docs/2026-10/2026-10-10/v075_translation_current_intent_candidate_manifest.json`。
- 开发交接：`.Codex/docs/2026-10/2026-10-10/v076_translation_current_intent_development_handoff.md`。
- 完整候选：仓库根 `.temp/risk-normalization-20261010/candidate-translation-current-intent-v075-r2/manifest.json`。
- 完整 manifest SHA256：`b8661a064b65677e34fa9553c70b28810f93e0b1e0a6846ab5fd5f379781cf4c`。
- 两 runtime 共 825 文件，10 changes，3 schemas；逐文件、schema、manifest 运行前后核验一致。执行的是完整最终 r2，未将初版或中间版自测归作最终 r2。
- analysis intents schema：`0475046d63a3f1f7ecf7f87541a72f0484f2373258ddb934eeb569114d99a1de`。
- overseas proof schema：`4d93e759fb949003788ca1250aecd2badb731a47aa7f098960123f3ea8109953`。
- translation intents schema：`7749d5e62753fd74e572c1aacc94f08c30413ba3983129aaf9cf824e6f5afe60`。

## 执行与结果

脚本：`.tests/2026-10/2026-10-10/v061_translation_current_intent_independent_sql.cjs`。隔离生命周期及 fixture 位于仓库根 `.temp/qa-v061-harness/`；采用现代 board schema，显式启用合成 source/game/community。translation call budget 是自建空 fixture 表，用于实际 worker 的预算查询，不构成生产预算验证。

执行命令（在本项目目录）：

```powershell
node '.tests/2026-10/2026-10-10/v061_translation_current_intent_independent_sql.cjs' --isolated --candidate 'C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/risk-normalization-20261010/candidate-translation-current-intent-v075-r2/manifest.json' b8661a064b65677e34fa9553c70b28810f93e0b1e0a6846ab5fd5f379781cf4c
```

一次执行 8/8 PASS，exit 0，无失败后重跑。

| case | 独立实际断言 | 结果 |
|---|---|---|
| 1 | F1 分析/翻译双 running，实际 page 更新 F2；唯一真实连接、begin1/commit1/rollback0；正文和双 intent generation2 提交，两个旧 job 保持全部字段；旧 frozen F1 成功/失败回包全表零写 | PASS |
| 2 | 旧 F1 lease 到期，指定 jobId 经实际 worker runControlled 仅一次回放、一次 fake provider；F2 翻译完成且 fingerprint 对齐正文，intent applied_generation2；旁边 B job/intent/audit 不动；错 version 提前全表零写，完成后旧 F1 仍拒写 | PASS |
| 3 | 重复 F2 generation2，F3 generation3；旧 page receipt 拒绝且全表零写；translation intent INSERT、receipt UPDATE 两处真实 SQL trigger 故障均整页回滚，内存 receipt 不推进 | PASS |
| 4 | 15 个任务字段逐项实际 SQL 改动，每项旧成功/失败回包均拒绝；每次比较完整业务 ledger，无 translation/job/audit 副作用，共 30 次拒写断言 | PASS |
| 5 | body/title/board_id/published_at/raw_payload 在 fingerprint 不变时修改，旧回包拒写；membership 错位、source disabled、consumer gate 缺失拒写 | PASS |
| 6 | manual q1-daily owner 的 expired pending 正常/force enqueue 均明确保护；manual、NULL lease orphan、预算耗尽不能 claim；borrowed 无事务拒绝且连接可继续使用 | PASS |
| 7 | translation result audit 实际 SQL 故障使 translation+job+event 整体回滚；replay audit 故障使 job 修复+intent ACK+audit 整体回滚 | PASS |
| 8 | intent content_id 使用 utf8mb4_bin，job content_id 保持 utf8mb4_unicode_ci，指定 job 回放通过且旁边任务不变；claim 候选查询后真实 SQL 清空正文，锁内重查拒绝 claim，job pending/attempts0 | PASS |

case4 的 15 字段：id、content_id、target_language、translation_version、content_fingerprint、status、attempts、next_retry_at、error_code、error_message、lease_owner、lease_until、created_at、updated_at、completed_at。每项修改后恢复原字段和 updated_at，独立观察；不是只修改传入 snapshot，也不是 mock SQL。

fake provider 只返回合成翻译；没有真实 AI/HTTP。case8 的查询间介入验证实际锁内可用性重查，未声称观察到并发 record-lock 等待；本轮未重跑既有锁等待矩阵。case3 的旧 receipt 围栏验证不代表完整网络 ACK 丢失或所有 intent 并发 ACK 覆盖。

## 原件与收尾

唯一运行原件：仓库根 `.temp/qa-v061-translation-fNGrye/result.json`，同目录保留 owner.json、fixture.env、init.log、server.log、data。fixture.env 仅隔离随机账号，报告不转录凭据。

MariaDB 10.4.14，serverId `20261091`，loopback 端口 `62351`，独立随机 datadir；mysqld 显式 `--no-defaults`、event scheduler OFF、仅 fixture 表 CRUD 用户。shutdown 前核对 port/serverId/datadir/pid_file/PID/runner identity；`identityBeforeShutdown=true`、`serverStopped=true`、`portReleased=true`。进程 exit0；额外 Get-NetTCPConnection 查询端口无监听。两个 consumer advisory gate 在 finally 释放。

`node --check` 通过，目标文件空白检查通过。只新增 QA 脚本和本报告，辅助原件位于仓库根 `.temp`；未改业务代码、经理待办、生产配置/DB、权限或服务/计划任务；未部署、push、发版、抓取三站、发通知或删除原件。

## 签署边界与生产状态

本轮确认：完整 v075-r2 的隔离候选翻译闭环可行；旧 active job 不再使该授权范围内正文 F2 必然整页回滚；到期可通过有界名单回放并由实际 worker 完成 synthetic F2。v060 报告中对应旧版本的翻译阻断结论保留为历史事实，由本报告仅在上述候选范围更新。

本轮未确认：现役 translation ACL（既有拒读未解除）、loaded producer/consumer 和全部 writer 身份、Q1/通知接线、生产 schema 与切换、真实定时采集恢复。它们继续未完成，**隔离修复不等于线上完成**。无生产新观察，不据此认定这些项目已故障或已恢复。

本轮亦不覆盖 legacy board 全矩阵、全部正文身份组合、完整并发锁/affectedRows0/网络 ACK 丢失、history lane、requestId、所有 manual running/expired 组合、无 orphan 自动修复、付费预算真实调用。未测范围不作为扩大本轮测试的理由。

交接建议：经理可收口本项独立部分 PASS，并按既有生产门禁处理下一步；开发保留完整 r2 身份和未完成接线清单，不自行宣称全恢复。本报告不授权生产 DDL、权限修改、切换、正式任务运行或发版。
