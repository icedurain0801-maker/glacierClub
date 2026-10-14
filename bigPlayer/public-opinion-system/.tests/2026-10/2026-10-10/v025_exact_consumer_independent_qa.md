# v025 精确消费者独立 QA

Status: ISOLATED_PASS
Date: 2026-10-10 (Asia/Shanghai)
Scope: 冻结包、offline guard、内存仓储；仅关闭 v024 隔离旧 API 旁路阻断，不是生产放行。

## 冻结与执行

- 冻结根：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-exact-consumer-v025-fixed-20261010/`
- manifest SHA256：`11ba10124aaced9bde63e66865c7c8c78d19baaab09700208368bae8ad648344`。前后核对 10 个清单文件 bytes/SHA256 全匹配；实际 11 文件含 manifest，无缺失或额外文件。
- 冻结根运行 `node --require ./offline-guard.cjs --test worker/test/overseasExactConsumer.test.js`：16/16 PASS，exit 0。
- 独立负测探针在同一 offline guard 下执行：`PASS`，exit 0。未连接生产、SQL、HTTP、AI、真实 provider、通知、13316 或国内 Worker。

## 独立结果

- 旧 `claimExact` 与 `reserve` 直接调用均抛 `EXACT_LEGACY_API_DISABLED`；job 保持 pending，call/audit 空，globalUsed/scopeUsed 为零。v024 直接旁路阻断已在本隔离包关闭。
- tuple 数组追加、元素改写均抛 `TypeError`；只派发原目标一次，第二 job pending。
- 失败结算分别伪改 call manifest/tuple/scope SHA，均拒 `EXACT_TRANSACTION_PRECONDITION`，audit 0、job running；完成时 tuple SHA 漂移亦拒。
- 同一 job 两消费者并发仅一次完成/派发/扣额，另一方 `EXACT_JOB_CHANGED`，仅一条 call。
- 两个不同 scope 各自 cap=1 可独立完成，global 累计为 2；同 scope 第二 job 与第三 scope 的 globalCap 拒绝均零新增 call。
- claim 返回快照的 fingerprint/version/lease epoch 漂移均在 provider 前拒；dispatch 后 lease epoch 伪改结算拒，audit 0。
- 缺归属字段在 admit 前拒且零扣额；无发送证据 timeout 进入 `UNKNOWN_HOLD`；cap 拒绝的第二 job pending；以上旧负例回归通过。

## 边界与剩余风险

- `verifyClaim` 漂移发生在成功 `admit` 之后，隔离探针可观察到 reserved call/running job/已占额度、provider 0。交接将其定义为已准入后的 HOLD；本次不验证后续恢复或退款，也不把它说成“失败准入零写”。
- 本次只证明内存隔离模块，未验证真实 SQL 原子事务、持久预算、真实账号/provider、现役排他、生产调度、异步 AI 入库或完整 runtime。历史全量 615 测试未重跑；其 stdout 未保存，不补写为已验证。
- 整体门禁继续 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`。不得以此报告启动真实采集、部署或发版。

## QA 原件

均位于 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/`：

| 文件 | SHA256 |
| --- | --- |
| `v025-qa-preverify.raw.json` | `06f995d038d17b3b29d0f0044aa494bd39ab7c05ae33b78ea2bb68a51bfdf293` |
| `v025-qa-focused.raw.txt` | `0ad41697d80a0db7a8f9587fe3b130673e6df06d8b31fedc42f25f21098e07a5` |
| `v025-qa-negative-probes.js` | `8d7244a373ff0ec43b889eb08617cf30ac9f1986a5ff59d7e76e1008baa421ac` |
| `v025-qa-negative-probes.raw.json` | `cfe3b158aef790f91b32d26961e1e71501fb1f9a8131f477c6378e5d67e90b5e` |
| `v025-qa-postverify.raw.json` | `06f995d038d17b3b29d0f0044aa494bd39ab7c05ae33b78ea2bb68a51bfdf293` |
