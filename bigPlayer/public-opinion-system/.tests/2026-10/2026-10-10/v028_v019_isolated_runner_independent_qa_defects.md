# v019 隔离侦察 runner 首包独立 QA 缺陷

Status: ISOLATED_NO_PASS / RETURN_TO_DEV / REAL_HTTP_NO_GO
Date: 2026-10-10 (Asia/Shanghai)

冻结根：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-v019-isolated-candidate-y201tO/`；manifest SHA256 `9a4890cdfe86d8e2b21f6cb515e74f07c3c56e8c84455f9958fc4b7a7cf458b0`。前后两个文件 bytes/SHA 匹配，实际三文件含 manifest；未改冻结包。QA 使用统一根 `.temp/v019-qa-offline-guard.cjs` 阻断 fetch、HTTP、TCP/TLS 常用入口，只调用合成 transport；guard 下冻结测试 4/4 PASS，独立负测 exit 0 并复现下列缺陷。无真实 HTTP/token、数据库、AI、服务或国内操作。

## 阻断

1. **P1 transport 隔离不足**：`scripts/overseas-v019-isolated-runner.js` 仅排除与 `globalThis.fetch` 同一函数的注入，任意未品牌化回调仍被调用一次。不能据此宣称 runner 只接受合成 transport；回调内部行为未由 runner 限定。QA 回调仅抛本地 marker，没有网络。
2. **P1 exchange/session 并非真实合同模拟**：传入的 root token 不进入 exchange 请求，query 和 authorization 都是 `[IN_MEMORY_ONLY]` 占位值；exchange 回包 site token 虽存入 map，context/board 等请求却继续发占位 header，从未复用。合成 24 次成功不能证明单次交换及同站 session 复用。
3. **P1 原始内容 ID 外泄到返回报告**：`redactedLog` 隐去 comment path，但 `run()` 同时返回 `report.requests`，其中 comment path 带原始 postId；QA 用标记 ID 复现 `contentIdInReport=true`。不得把仅 `redactedLog` 通过当整体输出脱敏。
4. **P1 时限未闭合**：调用方可传 `requestTimeoutMs=999999`、`totalTimeoutMs=999999` 绕过 10 秒/5 分钟上限；`response.json()` 在 transport 返回后才等待且不在 timeout race 中，合成永不 resolve 的 JSON 于 50ms 后仍悬挂，无法保证停批。
5. **P2 路径/参数 allowlist 不严格**：`safeRequest` 接受 post/list 的未批准 query 和 `/auth/comment/id/extra` 路径；当前内部正常路径不利用这些值，但安全入口没有 fail-closed 合同。

## 已验证边界

- 合成成功路径恰好 24 次、每站 8 次含 exchange，单回调顺序运行；直接 `globalThis.fetch` 与全部 `auth_status=unknown` 被拒。
- context board 不匹配时两次请求后停住，未进入 feed；synthetic redirect 一次后停止。以上局部行为不抵消阻断。当前真实 SRC-A 两站 auth unknown，测试中三站 authorized 是合成输入，不能替代真实授权。
- `report.status=ISOLATED_SYNTHETIC_PASS` 仅合成路径，绝不代表真实 HTTP、token 或采集成功。

## 原件（统一根 `.temp`）

| 文件 | SHA256 |
| --- | --- |
| `v019-qa-preverify.raw.json` | `696C0C6D1506B280DC8D0B3950997623BF043F3F4D32F217DA66AC420E26770B` |
| `v019-qa-focused-guard.raw.txt` | `6932D821E17A27F8CDAAA3DEF51BABE56DEAB38CAB831C4B322EF8A2F48C5CD3` |
| `v019-qa-negative-probes.js` | `79536E692031F9BCAABC3AC10C490EDF64B3A6BDEF648B352064CDA7A6F633CA` |
| `v019-qa-negative-probes.raw.json` | `8D2FF49371690B6F63935D72537F75E5765A5A56DE253BC594387B3085C590B2` |
| `v019-qa-postverify.raw.json` | `57A5465A3A8E6DA7455A7736333BD475CF50736928C989BE25A1CD550B17A083` |
| `v019-qa-offline-guard.cjs` | `7DB5BA483124A89B63699BBAE4C851414F9F8129A3FF71E84C760FEB8D509F45` |

旧包退回开发负责人，保持 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`；新冻结包须另行独立验收，不覆盖旧原件。
