# v003 真实下一槽 certified cursor 准入独立 QA

Status: `ISOLATED_CERTIFIED_REAL_NEXT_SLOT_ADMISSION_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD`
Owner: 测试负责人
Date: 2026-10-10 (Asia/Shanghai)

## 范围和边界

独立执行冻结包 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-scheduled-stage-xTmhjI` 的 fresh 自有 MariaDB 13316、serverId 20261036、`po_overseas_fixture`。Manifest SHA256 `e6175eb4e8d2e26f01da03bc112c9cece48264b80e5d3bebaa1ea0d62c8d28e6`，694 files。只验证原 3600 秒配置和真实 DB 时钟到下一槽的同 reader 非空认证 cursor anchor、六项证据漂移拒绝、第二槽 queued 准入；不 claim、不采集、不终态，不运行真实 HTTP、AI、通知、恢复 proof、第二 consumer、3306 或生产。国内和其他平台现役不动。

## 独立运行原件

所有 `.temp/` 路径相对于仓库根 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage`。原 `session_id=4865` 持续运行到完成，mode 退出码 0；未停机、重启或替代重跑。

| 原件 | SHA256 | 核验 |
|---|---|---|
| `.temp/xTmhjI-qa-preverify.raw.txt` | `9d92ca7750328cdfda24655ba3b5f72c50e771ae5f330399339210bae28e7734` | `verified=true, files=694`，exit 0 |
| `.temp/xTmhjI-qa-next-slot.raw.txt` | `2325d7f96434f8f72bf8f8b1f74f0c3568247e83a47d14e964fce41131d808fb` | 原 mode stdout/stderr，尾部 `EXIT_CODE=0` |
| `.temp/overseas-real-db-JUTuxz/result.json` | `7b549477619b866046d9a946e74c0440262fa6dbe5f2cae61f3c5480c0a59d19` | `PASS_ISOLATED_SCHEDULED_ADMISSION_PARTIAL` |
| `.temp/overseas-real-db-JUTuxz/next-slot-trace.jsonl` | `a116947e542a3b5ef103722a52e2d2a4f0e2a7bf262b9e0a652881105ba1b571` | 与 result 内 `traceSha256` 相同 |
| `.temp/xTmhjI-qa-postverify.raw.txt` | `9d92ca7750328cdfda24655ba3b5f72c50e771ae5f330399339210bae28e7734` | `verified=true, files=694`，exit 0 |

## 验收事实

- 首批成功父 `16275d2d-b30d-3d5a-e1bb-8d2f0f0b3635`，两站 `discovered=2, stored=2`，认证 cursor 均为 UTC `2026-10-09T17:02:49.572Z`，不是空值。配置 SHA `af3a68950ef0909f0c5592e5e62856b6400a6948308dac28d5f61d4ebc4fc80d`，`frequencySeconds=3600`、`scheduleVersion=1`。
- DB 时钟从 UTC `17:02:52.209Z` 等到 `18:00:00.014Z`，116 次观测、`waitElapsedMs=3430635.3357`。原定 `nextSlotAt=18:00:00.000Z`，同 reader 下一 anchor 为 `18:00:00.020Z`；两站 `windowStart` 均取原认证 cursor。未改变频率或 DB 时钟。
- 六项漂移——同时间换 cursor parent、同时间换 evidence、父 finished_at、child stored_count、父 terminal event detail、membership first_seen_at——各返回预期精确错误码，`admissionZeroWrites=true`、`restored=true`；准入受检 12 表零写。具体错误码见 trace/result 原件。
- 正常第二槽 `admitted`，新父 `6befc33e-1559-5505-695f-6e0c39e1a400`、batch SHA `7a65df7476ce288e23827cee93f409c758adc4c724a6b4adeaf38530848d0d7d`。仅 queued 准入，`realNextSlotAdmissionVerified=true`、`realNextSlotExecuted=false`、`nextSlotChildrenClaimed=false`、`nextSlotCollectionCompleted=false`。
- `serverStopped=true`、`portReleased=true`，验收后 `Get-NetTCPConnection -LocalPort 13316 -State Listen` 无结果。`productionTouched=false`、`realHttpExecuted=false`、`aiExecuted=false`、`recoveryExecuted=false`、`productionActivationAllowed=false`。

## 结论和剩余门禁

局部 `ISOLATED_CERTIFIED_REAL_NEXT_SLOT_ADMISSION_PASS`：只证明隔离真实 DB 原 3600 秒下一槽、同 reader 认证 anchor、六项漂移拒绝与第二槽 queued 原子准入。没有证明第二槽 claim/抓取/终态、真实 provider/AI/通知、恢复/多消费者、国内回归或生产切换。整体仍 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`，本报告不得作为发版 GO。
