---
status: ROOT_CAUSE_CLOSED_PENDING_INDEPENDENT_QA
date: 2026-09-22
role: development-lead
scope: BigPlayer H5 collection chain and blocked tasks
---

# BigPlayer 采集链根因闭包

## 安全边界

本轮仅使用代码、既有只读报告和脱敏测试证据；不读取 secret/token 密文，不执行 check-auth、真实 Run、生产 DDL、服务切换、重启、发布、push 或 3001 访问。

## 根因矩阵

| 项 | 优先级/owner | 可复现事实 | 当前状态 | 最小验收/前置 |
|---|---|---|---|---|
| A 凭据 subject 绑定 | P0 / 开发负责人+发布方 | 领取已有 sync run 时旧路径无条件读取 source 默认账号，claimed `account_id` 与默认账号不一致时可触发 `CREDENTIAL_NOT_FOUND`；当前 DB 外键链本身无错配 | 已做最小修复：`resolveRunAccount` 优先按 claimed `account_id`；待测试负责人独立回归；生产运行态仍未证明同版/同 DB | 脱敏 fixture 复现 account/source 差异；同一运行实例记录 source/account/credential_type/结果码，不输出密文 |
| B site registry | P0 / 开发负责人 | config `site-*` 与 `po_source_sites` `legacy-*` URL 相同但 ID 不同；repository admission 要求 site_id+URL 精确一致 | BLOCKED；不可直接重键历史 identity | 029 已登记；配置与 registry 可审计对齐；不得改写历史 checkpoint/run identity |
| C stale/lease/run | P0 / 项目经理+运维 | 当前基线必须使用 95 条冻结 `cp.id`；95 条已 quarantine，identity/cursor/window/site 保留；active lease=0 的证据只对冻结时刻有效；queued/active admission 需重新读取 | quarantine 子项 PASS；029/真实 Run 仍 BLOCKED | 重新只读确认目标 source/account active run=0、active checkpoint lease=0；全局 queued/lease 口径单独记录，禁止沿用旧 85 |
| D 运行身份闭环 | P0 / 发布方 | 服务 XML/PID 仍指向 TapTap formal1；BigPlayer target、manifest/provenance/rollback 资产虽可离线构建，但未切换；3000/3001 同源运行态未验收 | BLOCKED | 同一 evidenceId 下 API/Worker commit/path/DB 指纹、release manifest、rollback baseline 互引；发布后再验 health/3000，当前不访问 3001 |
| E scheduled_catchup window | P1 / 开发负责人 | `worker/src/sourceScheduler.js` 对过期 scheduled window 将 `windowEndAt` 置为实际 `now`；v333 QA 已验证 `[windowStart,windowEnd)`、00:00:10 内容纳入、等于上界排除，posts/comments 同窗 | 本轮补回归证据，待测试负责人独立回归；生产运行态未验收 | 单测固定执行时刻；确认 `windowEnd` 不早于实际执行时刻；发布后再做受控 Run 验收 |

## 关键证据

- `.tests/2026-09/2026-09-22/v336_bigplayer_source_account_credential_binding_readonly.md`
- `.tests/2026-09/2026-09-21/v323_v066b_multisite_site_registry_mismatch_root_cause.md`
- `.tests/2026-09/2026-09-22/v328_bigplayer_checkpoint_quarantine_result.md`
- `.tests/2026-09/2026-09-22/v329_bigplayer_checkpoint_quarantine_independent_retest_qa.md`
- `.tests/2026-09/2026-09-22/v332_bigplayer_fail_rate_root_cause_independent_qa.md`
- `.Codex/docs/2026-09/2026-09-11/v066_p0_last_night_bigplayer_credential_subject_fix.md`
- `.Codex/docs/2026-09/2026-09-22/v001_three_item_execution_precheck_changelog.md`

## 当前员工分工

- 开发员工：A/E 脱敏复现、最小代码修复和定向测试已完成，目标测试 `21/21 PASS`；待测试负责人独立回归。
- 开发负责人：B/C/D 证据收口、A/E 改动审查、根因矩阵、文件审查和变更记录已完成。
- 测试负责人：待 A/E 结果和本报告增量证据后独立验收；不改业务代码。

## 剩余外部输入

1. 同版 BigPlayer Worker 的受控运行证据及非敏感 DB 指纹。
2. 029 migration 的获批执行与 ledger/字段只读复核。
3. config/registry site identity 对齐方案和变更窗口。
4. 目标 source/account 的最新 active run/lease/queued 快照。
5. 发布后 API/Worker 同版 health、3000 入口和受控真实 Run 证据；3001 保持禁止访问。
