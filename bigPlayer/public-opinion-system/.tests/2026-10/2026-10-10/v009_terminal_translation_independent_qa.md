# 终态字段与翻译预算冻结包独立 QA

Status: `ISOLATED_TERMINAL_TRANSLATION_INCREMENT_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD`
Owner: 测试负责人
Date: 2026-10-10 (Asia/Shanghai)

## 范围

对 `.temp/overseas-qa-scheduled-stage-s6iWAb`（仓库根 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage`）独立执行五项串行 fresh MariaDB 13316/`serverId=20261036`/`po_overseas_fixture` SQL 场景和三文件 19 项离线回归。Manifest SHA256 `1c5e7eb7d4d7c7f05447c5ee9bb19c71b7dfd81efb43b1bf9928542ef41bacf7`，697 files；前后 verify 均通过。启动前和每项结束后检查 13316 无监听。没有运行通用 `--isolated`、旧 baseline diagnostic、恢复 progress、真实 HTTP/AI/通知、生产 3306 写入、服务切换或第二消费者；未重跑一小时真实下一槽。

## 独立原件

以下路径均相对于上述仓库根；五项命令和离线命令各自 exit 0。每个 SQL result 均 `productionTouched=false`、`serverStopped=true`、`portReleased=true`、`independent_instance_identity` 在 checks 中。最终端口 13316 listener count 0。

| 原件 | SHA256 | 核验 |
|---|---|---|
| `.temp/s6iWAb-qa-preverify.raw.txt` | `ccc848bacac9d7fa4b113c51b25c7c45809dea8efafd57fd28134312c0a089d1` | `verified=true, files=697` |
| `.temp/s6iWAb-qa-terminal-fields.raw.txt` | `33a97e254a0599c33691e0ca926b6ee81db1d1f03c74cba981ff7d9f1926cd27` | terminal fields PASS |
| `.temp/overseas-real-db-AuHy8w/result.json` | `729cafe272c9f11669c469fb8b17f41abc7e5a889bbb2f568e191c3756497325` | 60 负例 |
| `.temp/s6iWAb-qa-all-failed.raw.txt` | `c15ff0504c05e1c67b5d78afb2a04b6c1a365d6a89c67e1e7a3c6c583a5cdc0f` | all failed PASS |
| `.temp/overseas-real-db-fcBJ4B/result.json` | `567f2e1b313fb82daf4ee881a55c0ebccb964e42dc52f7f96003124f9c6ddfc6` | 两子 failed |
| `.temp/s6iWAb-qa-translation-budget.raw.txt` | `0dda3502886fc57b45eabbb1f326de9d39ddfbdf2178c4c7a615443dc1ad3739` | translation budget PASS |
| `.temp/overseas-real-db-OCNj0z/result.json` | `f50fced303d39e46c70e76b5a9efcdbd0561b89ec64833ddd215054909d23e25` | 46 负例 |
| `.temp/s6iWAb-qa-manual-audit.raw.txt` | `8d1a4a53b6bbc8ab4c78fee13bfd7c530065144a7db3ee7a66111b6b1911a7df` | fresh manual PASS |
| `.temp/overseas-real-db-Ui5nkB/result.json` | `b66ee56652361a3edb8a6484af87ebce99e14aaea3aa102792d97b37eedf463e` | 76 连接核验 |
| `.temp/s6iWAb-qa-certified-cursor.raw.txt` | `5530f8a12d5e0b0f8366d186640056f75621ab5aea380649e0e21bbc8581528d` | 短 cursor PASS |
| `.temp/overseas-real-db-GBtCcN/result.json` | `68d1c75edc01b95a0114f2381edb79fb2f1439046f1d9a5df52abdb58a5ddd56` | 初始认证，不是下一槽执行 |
| `.temp/s6iWAb-qa-offline.raw.txt` | `88c01cce33350993a3481ee88ced1fd0ba2a5a89f3d1572c89d7fc0f3f24a60e` | 19 pass/0 fail，guard denials `{}` |
| `.temp/s6iWAb-qa-postverify.raw.txt` | `ccc848bacac9d7fa4b113c51b25c7c45809dea8efafd57fd28134312c0a089d1` | `verified=true, files=697`，子命令 exit 0 |

后 verify 所在 PowerShell 复合命令的宿主退出码因最后一个 `Get-NetTCPConnection` 无监听结果而为 1；原 verify 子命令明确 `EXIT_CODE=0`，端口无监听另以显式计数 0 核实。未把宿主码冒称为 verify 失败或成功的唯一依据。开发交接文档 terminal raw SHA 曾有 63 字符录入错误，独立结果只采用本表 QA 新原件，不复用开发 hash。

## 结果与负测

- terminal fields：`PASS_ISOLATED_PARENT_TERMINAL_FIELDS`；60 个字段/actor/sourceEffect/分析告警计数负例均返回预期错误码且 `zeroWrites=true`，恢复后 12 表不变；正常父两站 `completed_authorized_scope`、2 discovered/2 stored、两 cursor 成功。`rawDatabaseEveryColumnVerified=false`，不是所有原始 DB 列矩阵。
- all failed：`PASS_ISOLATED_PARENT_ALL_FAILED`；两子均 failed，父按现行策略为 partial，0 discovered/0 stored、成功 cursor 行 0；原非空成功时间保留。不把全失败误报成父 failed，也不发布成功 cursor。
- translation：`PASS_ISOLATED_TRANSLATION_CALL_BUDGET_DRIFT`；46 个 reserve/consume 漂移、预算非法值、tuple/manifest 负例均 `zeroWrites=true`，九表快照；global/scope `cap=4, used=4`，到 cap 后原预付合法 receipt 可 consume。禁用 outbox 1 行，translation job 未执行；没有真实 AI/通知。`semanticUsageReconciliationVerified=false`、`budgetRowDeletionOrDayRekeyVerified=false`。
- manual：`PASS_ISOLATED_FRESH_MANUAL_AUDIT`；首次 claim 两个 outcome 分别为完成/失败，均 24 exact terminal keys、十表只读 reconcile 零写；76 个连接身份核验。未运行 recover/progress。短 certified cursor `PASS_ISOLATED_CERTIFIED_CURSOR_READ_BINDING`，初始 ACK/reader/anchor/admit 与漂移零写覆盖通过，`realNextSlotExecuted=false`。
- 离线 19 项全部通过，测试隔离 guard 无拒绝；它们不替代真实 DB 运行证据。

## 门禁结论

本批仅为当前模型的隔离增量 PASS。未实现或未验的包括 budget `used1→0`、预算行删除/scope/day 重标、call 账日对账、历史 ancestor UPDATE 竞争、持久目录与真实排空、第二槽 claim/采集/终态、真实 HTTP/AI/通知、恢复与共享单消费者生产切换。xTmhjI 的一小时真实下一槽准入独立报告仍单独有效，但不补足这些缺口。整体继续 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`，不授权生产激活或发版。
