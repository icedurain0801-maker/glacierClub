---
status: BLOCKED_INPUT
date: 2026-09-22
role: development-lead
scope: P0 root-cause closure B/C/D read-only supplement
sampledAtUtc: 2026-09-22T00:48:58.935Z
---

# BigPlayer B/C/D 当前只读补证

## B：site identity 与 migration 029

当前数据库 ledger 有 `027_bigplayer_multisite.sql`、`028_bigplayer_scheduled_site_runs.sql`，没有 `029_bigplayer_site_run_evidence.sql`。`po_sync_runs.site_id` 存在，但 `site_url_snapshot`、`last_request_at` 和 `po_sync_runs_site_request_idx` 均不存在。029 预检脚本未观察到写命令。

境内 source `5c21f78d-5f67-4467-963d-dcdeb5e26cab` 的 config site 为 `site-7586e54f3a0cb84f433d59cf6baa1d4d`，registry 同 URL 为 `legacy-7586e54f3a0cb84f433d59cf6baa1d4d`。境外 source `081a16d2-5545-4afd-9c65-e04777e4540b` 的 config 首站为 `site-8483a64ab230417e63c5e30d77b0a6f0`，registry 同 URL 为 `legacy-8483a64ab230417e63c5e30d77b0a6f0`。这是 URL 相同、site identity 不同的确定性差异；不能直接重键历史数据。

## C：当前 checkpoint/run/lease

采样时数据库 UTC 为 `2026-09-22T00:48:58.935Z`。

- 冻结的 95 个 `cp.id` 当前全部为 `failed`（95/95），`expired_or_null_lease=95`，有效 lease 为 0；这是已 quarantine 基线的当前状态。
- 当前全库仍有 1 条 `queued` run（前一次采样短暂显示 `running=1`，说明状态在变化，不能把单次 0 计数当作放行证据）。
- 全库 active checkpoint lease 为 828。
- 当前 BigPlayer stale running checkpoint 为 6；95 条冻结基线已经不是当前 stale running 集合，禁止退回旧 85 或把 95 继续称为 active。

结论：目标 source/account 的 admission 必须重新按同一时刻读取 active run、queued run、checkpoint lease 和 worker/schedule lease；当前全局 active lease/queued 状态不满足解冻条件。

## D：当前 Worker 与来源绑定

- 服务 XML：`C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.xml`
- 实际 PID：`32020`，启动时间 `2026-09-21T18:01:02.810167+08:00`
- 实际 Worker：`C:\ProgramData\PublicOpinion\releases\worker-release-taptap-20260921-v055-formal1\worker\src\worker.js`
- Worker SHA-256：`A932A32F55174D1715CFD5EAA36CC57E2668EC03F89D23CAE81078BD3030BF75`
- Worker release manifest SHA-256：`11A7F78D87F24D22DF3B297A68AF63AB36B219E33CC079664FA5A6FD1EB126AC`
- 服务 XML SHA-256：`82CB2AA0B974C0DF980405F3EEF379F88C8C59D12D3EF06AB9AD7DC8111ACBEE`
- 非敏感 DB 指纹：`DB_HOST=12CA17B49AF2289436F303E0166030A21E525D266E209267433801A8FD4071A0`，`DB_NAME=50DDDE421C4C430FA796F9AE3763E4D963234071CAC2F7D8C7010913A2FF4BCB`
- 来源绑定只读链：境内 `5c21... → 70c393... → credential 931761...`；境外 `081a... → 75c820... → credential a886...`，两条 source/account 均 enabled + authorized，credential 为 active `api_token`，未读取密文。

当前 Worker 是 TapTap formal1 release，不是 BigPlayer target。因而无法把数据库授权元数据直接等同于当前运行实例已加载凭据，也不能宣称 BigPlayer 运行身份闭环成立。

## 阻断输入

1. 029 migration 的获批执行与 ledger/字段复核。
2. config/registry site identity 对齐方案，及历史 checkpoint/run identity 的保护方案。
3. 当前目标 source/account 的稳定静默窗口；全局有 queued/active lease 变化。
4. 同版 BigPlayer Worker 的受控运行证据和发布后 health/Run 证据。

本报告仅为只读补证；未读取 secret/token，未执行 check-auth、DDL、真实 Run、服务切换/重启、发布/push 或访问 3001。
