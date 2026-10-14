# v021 精确消费者冻结包独立离线 QA 缺陷退回

Status: `ISOLATED_NO_PASS / RETURN_TO_DEV / FULL_RUNTIME_NO_GO / CUTOVER_HOLD`
Owner: 测试负责人
Date: 2026-10-10 (Asia/Shanghai)

## 冻结与范围

仅审查仓库根 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-exact-consumer-v021-runnable-20261010`，manifest SHA256 `27a68a8fbdc24b1f6f9cee8978cdcc60b7652415575ffefb422714903d067bb5`。九个列明文件逐项 bytes/SHA 匹配，另有 manifest 本身，前后无漂移/额外文件。运行冻结根 `node --require ./offline-guard.cjs --test worker/test/overseasExactConsumer.test.js`，6/6 pass、exit 0；又通过同一 guard 运行独立纯内存负测。没有生产/SQL/13316、真实 HTTP/token/AI/通知或业务代码修改。开发侧历史 615 全量 stdout `NOT_SAVED_NOT_RECREATED`，未充当 QA 证据。

| QA 原件（仓库根 `.temp/`） | SHA256 |
|---|---|
| `v021-qa-preverify.raw.json` | `4ded3a61c7c6d5652b1aa7598bf885d4207313b2347faba75d6bed590e14f9f7` |
| `v021-qa-focused.raw.txt` | `ab2b85d5ed7848e06afa2a4ad1bfd9a290c9777c1414d1ba42bc608d44975cf0` |
| `v021-qa-negative-probes.js` | `6c5b52dc72c09bf8ed2734c61484c6b6a457705f102aa5212f980a031ec65fa2` |
| `v021-qa-negative-probes.raw.json` | `8de89751788bb8e47efff66af06b049a2ea2eaccc5bf7ec7e079771f283b8c6b` |
| `v021-qa-postverify.raw.json` | `4ded3a61c7c6d5652b1aa7598bf885d4207313b2347faba75d6bed590e14f9f7` |

## 阻断缺陷

1. `P1` 精确 job 归属缺字段 fail-open。`worker/src/overseasExactConsumer.js:67` 仅在 `job[key] != null` 时比较 source/account/game/community/site/board；独立 probe 的 pending job 六项归属全缺，仍得到 `completed` 和 job `completed`。这不满足 manifest/job 精确绑定。归属未知必须拒绝，不能把字段缺省视为匹配。
2. `P1` call tuple 哈希漂移仍可 completed。`worker/src/overseasExactConsumer.js:83-92` 的完成事务只查 call 状态和 job lease，不复核 call 中的 manifest/tuple/scope 哈希。probe 在 provider 返回 ACK 前将可见 call 的 `tupleSha256` 改成伪值，结果仍 completed 且伪哈希留在 call。需要在完成/结算边界核对当前持久绑定，不只在 reserve 时传参。
3. `P1` 未知 dispatch 异常错误归类为 `NOT_DISPATCHED`。`worker/src/overseasExactConsumer.js:109-117` 只识别显式 `dispatched=true`、`UNKNOWN` 或 `unknown=true`，其余异常默认未发送。模拟无发送确认信息的 transport timeout，结果 `NOT_DISPATCHED`/job failed；无法证明未发送，按要求应 `UNKNOWN_HOLD`，只有明确未发送才能 `NOT_DISPATCHED`。
4. `P2` 额度拒绝留下 running job。`worker/src/overseasExactConsumer.js:104-107` 先 claim 再 reserve，没有 reserve 失败收口。两 tuple、global/scope cap=1 的一次消费中只派发第一条；第二条 `EXACT_BUDGET_EXHAUSTED`，但 job 保持 `running` 且 lease owner 非空。不能把单独 `repo.reserve` 的 1 胜 1 拒测试视为整条 consumer 流程的安全收口。

所有复现仅使用冻结模块和内存 repo/provider，guard 前置，不意味着任何真实 provider 已调用。冻结自带测试的 6/6 是其既定正例通过，不覆盖上述负例；不能据此给 isolated PASS。另原 `scopeUsed` 只是一份标量，跨 scope 隔离行为没有由六项测试证明，属于待补验证，不将其推测为已实证缺陷。

## 退回与门禁

退开发负责人按四项最小缺陷修复、补内存回归并重新冻结唯一可复跑包；测试负责人不改业务代码。新包需再做前后哈希和独立负测，旧冻结不可自行覆盖。生产接线、真实 SQL/provider/预算/通知未验，整体继续 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`。
