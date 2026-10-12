# v302 风险等级三件套 v058e 真实样本验收准备

- Run ID：`risk-v058d-real-20260921-3e462961`
- 候选：`.temp/candidates/v058e`
- Manifest SHA256：`E9BDA9C8978D7159EAF326CF73BFCBA8FE12C9DA53119C4B48C82B50170C28BA`
- 执行阶段：`preflight`
- 结果：`READY_FOR_WRITE_APPROVAL`

## 固定样本

| 角色 | externalId | contentId | 当前值 | 归一化预期 |
|---|---|---|---|---|
| fixed_919098 | `919098` | `bc64d7a5-4032-49e9-80cd-4c83fabb7e94` | `negative / normal` | `urgent` |
| fixed_919167 | `919167` | `74f19f1c-f027-4826-a042-fb49dcc19724` | `negative / attention` | `urgent` |
| ordinary_negative | `6826813` | `3454bd9f-8bec-43e6-8eb5-e296ff965575` | `negative / normal` | `attention` |
| positive_reconciliation | `920120` | `20a46255-d6db-4140-b6c5-10dc9d5c5ea1` | `positive / attention` | `normal` |

四个样本均匹配固定 source、game、community 和 `bigplayer_h5` platform；3001 API 对四个 externalId 均返回 `200`。

## 门禁结论

1. v058e 已包含 candidate-owned 的幂等 `reconcilePositiveRiskAlerts`，仅处理最终 `positive / normal` 内容关联的 pending/processing 告警。
2. 正向样本 `920120` 当前告警关联数为 `0`，写阶段将按批准方案幂等创建一条带固定 runId 的受控 pending 告警，再由候选方法闭环为 `false_positive`；不会删除该历史证据。
3. 数据库不存在 outbox/notification/message 表，因此 outbox 证据为 `N/A`，没有伪造计数。
4. 数据库存在 `po_audit_events`；写阶段将核对唯一审计记录包含 contentId、alertIds、originalSeverity、finalSeverity、reasons、runId。
5. `writePhaseAllowed=true`，本次仍未运行 `--phase=write`，等待开发负责人审核。
6. `AlertEngine` 已增加 positive/normal 首入口门禁，正面攻略即使命中 urgent/immediate 风险词也不会新建、关联或通知告警。

## 副作用确认

- 服务停止、重启或切换：`0`
- DB 写入：`0`
- 真实 AI 调用：`0`
- 通知调用：`0`
- 同步 run：`0`

无通知门禁已强制设置 `DINGTALK_ENABLED=false`、移除当前进程 webhook/secret，并预置 FailFast notifier。

## 证据

- 脚本：`.tests/2026-09/2026-09-21/v302_risk_severity_real_samples.js`
- 当前成功证据：`.tests/2026-09/2026-09-21/evidence/v302-risk-v058d-real-20260921-3e462961/preflight.json`
- `preflight-failure.json`：前置脚本诊断历史（根路径修正前/动态选样阶段），不代表本次 v058e 固定四样本 preflight 结果。

## 后续条件

开发负责人审核 v058e 与 v302 写阶段脚本后，方可执行 `--phase=write`。该阶段只允许创建一条明确标记 runId 的受控 pending 告警并由候选自动闭环；禁止真实 AI、通知、服务操作、同步 run、删除和扩大样本。
