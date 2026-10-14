# BigPlayer 境内受控恢复生产验收报告

- 日期：2026-09-11
- 测试角色：测试负责人（数据恢复风险例外）
- 目标 source：`5c21f78d-5f67-4467-963d-dcdeb5e26cab`
- 范围：仅境内、单一 UTC 近 7 天 manual run；未处理境外、未批量回补、未覆盖 7 天前内容、未改频率

## 前置验证

- `c0d2b89` 定向测试：4/4 PASS，覆盖固定 run 忽略遗留 `historyStart`、非法窗口 fail-closed、recovery gate 单源消费。
- API：已有 PID `55932` 监听 `4320`，未重启。
- 目标 source 启动前：`enabled=0`、`frequency_seconds=3600`、`auth_status=authorized`、凭据摘要已配置、活动 run=0。
- Worker：启动 PID `28916`，日志确认 `mode=enabled`、`recoverySourceId` 仅指向目标 source、扫描间隔 60000ms。

## 受控动作与结果

1. `PATCH /api/public-opinion/sources/5c21f78d-5f67-4467-963d-dcdeb5e26cab` `{ "enabled": true }`：HTTP 200，source enabled=1，频率仍 3600。
2. `POST /api/public-opinion/sources/5c21f78d-5f67-4467-963d-dcdeb5e26cab/sync` `{ "mode": "backfill", "lookbackDays": 7 }`：HTTP 200，唯一 run `10268a17-feae-4d06-a091-abe636c73979`，`queued=true`、`reused=false`。
3. run 终态：`completed_authorized_scope`，但 `fetched=0`、`stored=0`、`inserted=0`、`changed=0`、`comment_count=0`，无错误码。
4. 内容只读复核：目标 source 内容总量 3072，首条仍为 external id `916457`、`collected_at=2026-09-10 09:30:36`；本次未观察到新增或更新。

## 回滚与安全收尾

- 因零抓取/零写入不满足恢复验收，立即停止 PID `28916`。
- `PATCH .../sources/<target>` `{ "enabled": false }`：HTTP 200，source 已恢复 disabled。
- 收尾核对：Worker PID 不再运行；未占用/重启 3000，3001 保持原有监听；未创建第二个 run、未删除数据、未改变频率。

## 结论

**生产受控恢复验收：FAIL。** 该 run 的状态名为完成，但零抓取、零写入，不能视为数据恢复成功；本报告不推断未证实的具体根因。

- P0：1 个生产恢复阻断（完成态与零数据不满足恢复验收）
- P1：0
- P2：0
- 代码合同：`c0d2b89` 定向 4/4 PASS
- 生产准入：仍 `NOT_ADMITTED`

后续需由开发/运维在不扩大范围的前提下核对该 run 的实际窗口字段、Worker 运行日志、连接器返回和生产 schema；在原因明确并重新获批前，不得再次启用来源或重试同步。
