# v024 精确消费者独立 QA

Status: ISOLATED_NO_PASS / RETURN_TO_DEV
Date: 2026-10-10 (Asia/Shanghai)
Scope: 冻结包 + offline guard + 内存仓储；未连接 SQL、HTTP、AI、真实 provider、13316、生产或国内 Worker。

## 冻结与原命令

- 冻结根：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-exact-consumer-v024-fixed-20261010/`
- manifest SHA256：`a0ac297d7e96f19275c787b24d78499012ee0756aab59ccfe07b61ec8244c399`。前后各核 10 个清单文件 bytes/SHA256 均匹配；实际 11 文件含 manifest，无缺失或额外文件。
- 从冻结根运行 `node --require ./offline-guard.cjs --test worker/test/overseasExactConsumer.test.js`：15/15 PASS、exit 0。
- 独立探针同一 guard 执行：预期旧 API fail-closed 断言失败，exit 1，原始输出状态 `FAIL_LEGACY_API_OPEN`。此为 QA 发现的行为失败，而非脚本运行异常。

## 阻断缺陷

**P1 旧 `claimExact` / `reserve` 旁路未禁用。** `worker/src/overseasExactConsumer.js:81-82` 定义了抛出 `EXACT_LEGACY_API_DISABLED` 的方法，但同一个返回对象在 `:104` 和 `:118` 再次定义同名方法，后者覆盖前者。独立探针直接调用两旧方法，均无异常：`claimExact` 将 pending job 改成 running、写入 lease；`reserve` 在传入伪造的 tuple/scope hash 时新增 reserved call，globalUsed/scopeUsed 各加一。它绕过了原子 `admit` 所承诺的有效 job/唯一 claim/绑定与预算联合门禁。此为隔离内存 repo 的已证实缺陷，不推断真实 SQL 存在同名旁路。须删除后定义旁路或确保旧入口实际 fail-closed，并加入直接调用负测，重新冻结。

## 通过的独立负测

- tuple 数组追加、元素 version 篡改均抛 `TypeError`；旧 hash 下只派发原 tuple 一次，第二 job pending。
- 失败结算分别伪改 call 的 manifest/tuple/scope SHA：均拒 `EXACT_TRANSACTION_PRECONDITION`，audit 0，job running；完成分支 tuple SHA 漂移亦拒，audit 0。
- 同一 job 两消费者并发：一次 completed、另一次 `EXACT_JOB_CHANGED`，provider 一次，global/scope 各扣一且只有一条 call。
- 同 scope 第二有效 job 被 scopeCap=1 拒，另一 scope 可成功；随后第三 scope 被 globalCap=2 拒。两 scope 各用一，globalUsed=2、calls=2。
- claim 返回快照的 fingerprint/version/lease epoch 伪改均在 provider 前拒；lease epoch 在 dispatch 后伪改，结算拒且 audit 0。
- 缺归属字段在 admit 前拒，provider/call/预算均为零；无证据 timeout 为 `UNKNOWN_HOLD`；第二 job cap 拒仍 pending、无额外 call；完成时 tuple SHA 漂移拒绝。

## 限制与待核

- claim 返回快照异常发生于 `admit` 已成功之后，探针观察到 call `reserved`、job running、额度已占、audit 0，provider 0。此不违反“未成功准入零写”，但实际仓储异常下需要明确定义释放/隔离/人工恢复策略，避免永久悬挂。该探针通过 QA 包装器伪造返回快照，不代表真实 SQL 行漂移。
- dispatch 后故意伪改 lease epoch 被拒且保留 running/dispatch_started 以待核查；不能据此声称链路已完成对账。
- 本次仅可判断内存隔离逻辑，不能认证生产预算、持久事务、真实 provider、现役排他或整体 runtime。历史全量 615 测试未重跑，stdout 不重建。

## QA 原件

下列原件均位于 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/`：

| 文件 | SHA256 |
| --- | --- |
| `v024-qa-preverify.raw.json` | `5dbc5f530c8201f0090a064642d74d1b5c548d4134fc0576f26f2ff39835b42b` |
| `v024-qa-focused.raw.txt` | `8e2a7c8fc875cbd9c5118ca6821ce043c1a7800b0ac78420fde7e32d213e27f2` |
| `v024-qa-negative-probes.js` | `7705c803d9b130b89ad6bb95c4ade2f0a540f36f77fafc4d4572496058037ab3` |
| `v024-qa-negative-probes.raw.json` | `ecbc83ddb36d57ec4064022add47b06266b80df596bcb552569bb2459cf778ef` |
| `v024-qa-postverify.raw.json` | `5dbc5f530c8201f0090a064642d74d1b5c548d4134fc0576f26f2ff39835b42b` |

结论：退回开发负责人修复旧 API 旁路并重新冻结；维持 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`。15/15 开发/QA 聚焦测试与已通过负测均不足以覆盖该阻断，更不能放行真实采集。
