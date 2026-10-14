---
status: fail_blocked
date: 2026-09-22
role: test-owner
topic: BigPlayer FAIL 率口径与根因复核
---

# BigPlayer FAIL 率根因独立复核

## 结论

当前不能把 3000 概览页的负面率当成采集任务 FAIL 率。3000 概览页本次静态筛选显示总 176、负面 24、负面率 13.6%；它是内容情感分布，不是任务成功/失败比例。当前重新打开 collection-runs 时 3000 已连接拒绝，因此没有实时任务批次证据，生产口径保持 BLOCKED。

历史 BigPlayer 任务的高 FAIL 率有明确证据：失败发生在采集凭据解析阶段，首要错误码为 `CREDENTIAL_NOT_FOUND`，不是“已抓取后 AI 分析失败”。

## 根因证据

- `.tests/2026-09/2026-09-10/v064_last_light_bigplayer_zero_content_diagnosis.md`：2026-09-08 有 1,578 次失败，2026-09-09 有 1,440 次失败，均为 `CREDENTIAL_NOT_FOUND`；`fetched/stored/inserted/comments` 全为 0。
- 同一报告明确指出：`auth_status=authorized` 不能证明运行时 `CredentialContext.load(..., 'api_token')` 能读取同一账号的有效凭据，属于凭据记录与运行时解析/运行实例配置不一致。
- `.Codex/docs/2026-09/2026-09-11/v092_bigplayer_schedule_p0_incident.md`：境内来源曾为 `enabled=0`；境外来源虽 `enabled=1` 且 `authorized`，仅有一次成功写入 25 条，其余仍为 `CREDENTIAL_NOT_FOUND`。
- 因调度按频率继续入队，同一根因会产生大量零产出 failed run，故 FAIL 率被重试次数放大；不能用“账号页面已授权”替代运行时成功 run 证据。

## 本轮候选复核

- r3 manifest：12/12 文件 hash 复算一致。
- 离线状态机：8/8 PASS。
- PID/路径/服务快照：同一 UTC evidence 时间戳，API/Worker 路径与服务状态一致。
- 仍为 `PASS_EQUIVALENT_TESTS_BLOCKED`：3000 连接拒绝、共享 gate/多实例广播未实现、外部脚本/队列未现场审计。
- 未访问 3001，未执行服务控制、DDL、配置修改或真实 Run。

## 退回项

开发负责人需提供同一 UTC evidenceId 下的运行时凭据绑定链（source/account/platform/credential）、成功授权探针和最小真实 Run 产出；同时补齐 3000 只读入口、共享 gate/广播与外部绕过现场审计。项目经理未确认这些证据前，不得将 FAIL 率下降或 `authorized` 状态写成采集恢复。
