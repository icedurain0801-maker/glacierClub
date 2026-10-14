# v023 精确消费者修复独立 QA

Status: ISOLATED_NO_PASS / RETURN_TO_DEV
Date: 2026-10-10 (Asia/Shanghai)
Scope: 冻结包离线、内存仓储、offline guard；不代表真实 SQL/provider 或生产 runtime 验收。

## 冻结与执行

- 冻结根：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-exact-consumer-v023-fixed-20261010/`
- manifest SHA256：`6d0f4800d5ebd2d9d05d79a2dd37a32274386759fa22432a6f1c690cea1b2a41`。前后核对 10 个清单文件的字节数和 SHA256 均匹配；实际 11 文件含 manifest，无缺失或额外文件。
- 冻结根内运行 `node --require ./offline-guard.cjs --test worker/test/overseasExactConsumer.test.js`：10/10 PASS，exit 0。
- 独立负测在同一 guard 下调用冻结模块，exit 0；原始结果与脚本见下方证据。没有连接 SQL、HTTP、AI、真实账号、现役 worker 或 13316。

## 阻断缺陷

1. **P1 动态追加绕过 manifest 固定清单**：`createExactManifest` 仅冻结外层对象，`tuples` 数组仍可写（`worker/src/overseasExactConsumer.js:39-45`）。独立探针在生成后追加第二个 tuple，`manifestSha256` 保持原值，consumer 却派发两次、两个 job 均 `completed`（`:104-106`）。精确消费的目标集合与哈希不再一致。应拒绝运行时清单漂移，并补负测。
2. **P1 失败结算未复核 call 哈希**：`settle` 仅检查 lease 与 call 状态（`:85`），不像 `complete` 检查 manifest/tuple/scope hash（`:90`）。探针在 provider 回调中将 call 的 `tupleSha256` 改为伪值并返回明确 `dispatched:false`，仍得到 `NOT_DISPATCHED`；job `failed`，伪哈希保留在 call，audit 写入。此为隔离内存仓储注入试验，证明失败结算路径缺少相同前置条件，不宣称真实数据库可由 provider 直接改写。

## 其他风险与边界

- **P2 无发送竞争扣额**：同一 job 两消费者并发且 cap=2，只有一次 provider 派发和一次完成，另一方 `EXACT_JOB_CHANGED`、call `not_dispatched`，但 global/scope used 均为 2（`:106-109`、`:75-84`）。请开发确认“reserve 先于 claim 且不退款”是否为明确预算策略；若额度表示实际调用，则会虚耗一次。缺归属字段的拒绝同样先占一次额度且无派发。
- **跨 scope 仅夹具限制**：共用一个内存 repo，globalCap=2/scopeCap=1，site-en 完成后 site-fr 因 `EXACT_BUDGET_EXHAUSTED` 拒绝，globalUsed=1。`scopeUsed` 是该 repo 的单个标量（`:54`），不能据此推断生产全局账本的跨 scope 行为；需要独立的 SQL/预算合同验证。
- **claim 返回值一致性待核**：QA 包装 `claimExact`，让返回快照中的 fingerprint/version 与实际持久 job 不同，仍派发并完成。此探针只证实消费者未再次校验仓储返回快照，不能证明生产持久行发生漂移；开发需明确 repo 合同或补不一致拒绝测试。

## 已通过回归

- 缺少归属字段：`EXACT_JOB_SCOPE_CHANGED`，provider 0 次，job pending（但已 reserve）。
- 完成前 call tuple hash 漂移：`EXACT_TRANSACTION_PRECONDITION`，job running，call dispatch_started，audit 空。
- 无发送证据的 timeout：`UNKNOWN_HOLD`，job held。
- cap=1 的第二 job：`EXACT_BUDGET_EXHAUSTED`，第二 job pending、无 lease，provider 总共一次。

## 原件与结论

| 原件（均在 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/`） | SHA256 |
| --- | --- |
| `v023-qa-preverify.raw.json` | `fa83ddcbc06f2842412e347845fb0051648de5ba35030b71aeb6a4ed83f13711` |
| `v023-qa-focused.raw.txt` | `294096a274f820dd498125e2add482e5a6da8ef7677b3790ff0845e38727df1e` |
| `v023-qa-negative-probes.js` | `c9adcf1069dda05d64d5de572fa44259ee21db21087cfddc6a1f96daacef5004` |
| `v023-qa-negative-probes.raw.json` | `c4aacdaf0ed72f7066b2eee3563d6015810ed6b37a4e0cc2554dd9b9b9d66fbf` |
| `v023-qa-postverify.raw.json` | `bae69c4bf244e7edbf238b5dbe68e9b6e1f40e554cef3a2275ec08b2d896a822` |

退回开发负责人修复并重新冻结后再做独立 QA。当前仅为 `ISOLATED_NO_PASS`，整体仍 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`；不得依据聚焦 10/10 放行真实采集或发版。
