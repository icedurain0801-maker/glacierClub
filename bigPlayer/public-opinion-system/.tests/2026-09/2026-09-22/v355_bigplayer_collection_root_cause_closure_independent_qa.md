---
status: BLOCKED_INPUT
role: 测试负责人
scope: BigPlayer 采集根因 A-E 闭包独立只读复核
date: 2026-09-22
---

# v355 BigPlayer 采集根因闭包独立 QA

## 结论

**BLOCKED_INPUT**。

根因矩阵已基本把代码事实、离线测试 PASS、生产未验收和外部输入分开；但 A-E 不能整体宣称采集恢复。A/E 的离线定向回归已独立通过，B/C/D 仍有明确外部或运行态阻断。

## A-E 边界核对

| 项 | 独立核对 | 结论 |
|---|---|---|
| A 凭据 subject 绑定 | v354：`resolveRunAccount` 有 `claimed.account_id` 时调用 `getAccount`，无绑定才回退 default；21/21 PASS | 离线 PASS；同版生产 Worker/DB 运行态仍未验收 |
| B site registry | v323 只读证据：config `site-*` 与 registry `legacy-*` URL 相同但 ID 不同；029 未登记，`site_url_snapshot/last_request_at` 缺失 | BLOCKED；不得重键历史 identity |
| C stale/lease/run | v328/v329：当前冻结 95 条 quarantine，计数守恒、identity 保留、active lease=0 | 仅冻结时刻 quarantine 子项 PASS；最新目标 source/account 的 active run、queued、lease 未重新只读确认 |
| D 运行身份闭环 | v346/v343：服务 XML/PID 指向 TapTap formal1；BigPlayer target/上一版 BigPlayer rollback 未作为生产运行闭环切换验收 | BLOCKED；不得把 TapTap baseline 当 BigPlayer previous release |
| E scheduled_catchup | v354：窗口结束覆盖执行时刻，午夜内容可纳入；sourceScheduler 定向回归通过 | 离线 PASS；生产同版 Worker/真实 Run 未验收 |

## 关键口径复核

- **95 条 stale 基线**：v328/v329 的当前处置对象是冻结的 95 条 `cp.id`，不得退回 v323 的历史 85 条清单；85 条只能作为历史证据，不能作为当前基线或重新操作范围。
- **site-* / legacy-***：同 URL 不代表同 identity。v323 明确 config 的 `site-*` 与 registry 的 `legacy-*` 不一致；需经 029、审计对齐和历史 checkpoint/run identity 方案后处理，不能静默重键。
- **029 缺失**：v323 明确 `029_bigplayer_site_run_evidence.sql` 未登记，`po_sync_runs` 缺少 `site_url_snapshot`、`last_request_at`；该项仍是 admission/运行证据阻断。
- **TapTap runtime 身份**：服务 XML 当前指向 `worker-release-taptap-20260921-v055-formal1`。离线 BigPlayer target 可证明代码/资产，但不能证明同版生产运行身份。
- **scheduled_catchup 窗口**：代码/定向单测证明 `[windowStart, windowEnd)` 口径及执行时刻上调；未发生真实 Run，因此不能把离线 PASS 写成生产采集恢复。

## 安全边界与阻断项

- 未读取 secret/token 密文。
- 未执行 check-auth、真实 Run、生产 DDL、服务切换、重启、发布、push 或 3001 访问。
- 仍缺：同版 Worker 非敏感 DB 指纹与运行证据、029 获批/登记复核、site identity 对齐方案、目标 source/account 最新 active run/lease/queued 快照、发布后同源 health/3000/受控 Run。

## 判定

本报告只确认根因矩阵的证据边界与 A/E 离线回归结果；不补写“采集已恢复”或“FAIL 率已下降”结论。整体保持 **BLOCKED_INPUT**。
