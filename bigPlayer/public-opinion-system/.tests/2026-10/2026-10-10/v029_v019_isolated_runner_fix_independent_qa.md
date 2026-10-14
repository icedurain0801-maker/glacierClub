# v019 隔离侦察 runner 修复包独立 QA

Status: ISOLATED_NO_PASS / RETURN_TO_DEV / REAL_HTTP_NO_GO
Date: 2026-10-10 (Asia/Shanghai)

冻结根：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-v019-isolated-candidate-EJxUjH/`，manifest SHA256 `653f771e98caeba9940db1de632eee51c40889e45f97b0a00bfdede85007c5ec`。前后两个文件 bytes/SHA 均匹配，实际三文件含 manifest、无额外文件。QA 以 `.temp/v019-qa-offline-guard.cjs` 阻常用 fetch/HTTP/TCP/TLS 入口，在 guard 下冻结测试 5/5 PASS；另运行独立恶意合成回调负测，exit 0。全程无真实 HTTP/token、SQL、AI、服务或国内操作。开发 `QA_EVIDENCE` 与 5/5 不代签独立结果。

## 剩余阻断

1. **P1 合成 transport 品牌可由调用者签发。** WeakSet 私有，但公开导出 `createSyntheticTransport(handler)` 允许任意 handler 获得品牌；QA 用只抛本地 marker 的非品牌回调证明其直接被拒，用公开 factory 包装同一任意回调后它被实际调用。模块无法保证 handler 不含真实网络或额外请求；离线 guard 是本次 QA 外加约束，不是 runner 的不可伪造能力。未实际联网。
2. **P1 总墙钟可被注入时钟绕过。** `now` 是公开可注入参数；QA 将其固定为 0，设置 `totalTimeoutMs=10`，实际墙钟约 372ms 后仍执行 24 个合成请求并返回 `ISOLATED_SYNTHETIC_PASS`。同一 callback 内有额外本地动作时，报告仍只记 24 次，无法由 runner 计量 transport 内部潜在请求。不能宣称真实 5 分钟硬上限或隐式请求为零。
3. **P1 单请求 timeout 分段叠加。** transport 等待 25ms 后返回 JSON 永不完成，在 `requestTimeoutMs=40` 下结束耗时约 79ms，因 transport 与 JSON 各自重新启动一段完整 timeout，而非同一截止时刻。虽然最终 `RESPONSE_JSON_TIMEOUT`，不满足单请求硬上限。
4. **P2 comment 路径仍前缀放行。** `safeRequest` 接受 `/api/club/v1/auth/comment/id/extra?postId=id`，没有精确单段 ID/path 合同；未知 list query 已能拒绝，但路径边界未闭合。
5. **真实 unknown 站点无法进入受控认证探针。** `assertFixtureSource` 在任何 exchange 前拒绝 source 中有 `authStatus=unknown` 的站点，QA 观察 provider 回调零次。当前 SRC-A 有两站 unknown；不能用三站 `authorized` 合成 fixture 的 24/24 说明这些站的受控 token/context/board 侦察已可执行。即使以后允许受控认证探针，feeds 仍须在同站 context 与 board 成功前阻断。

## 已修与局部通过

- 非品牌回调在入口拒绝；root token 仅用于三次 exchange，合成回包 site token 在同站 context 后续 header 复用；完整返回 `report` 与 `redactedLog` 均不含 QA 原始内容 ID/root token。
- 合成成功路径 24 次、每站 8 次含 exchange；context board 不符只调用两次即停止，redirect 测试停止且不重试。未知 list query 拒绝。
- `requestTimeoutMs`/`totalTimeoutMs` 数值上限不能被调用方放大到 999999，JSON 永不 resolve 可进入 timeout。上述局部行为不抵消可注入时钟与分段 deadline。
- 当前 frozen source 仅检别名、board、语言和若干公开站点字段；QA 合成 siteId 可伪造仍被接受。它不是 v027 当前 source/account/site HMAC 与授权合同的不可变签发，不能作为真实三站身份认证。

## 原件（统一根 `.temp`）

| 文件 | SHA256 |
| --- | --- |
| `v019-qa-ejx-preverify.raw.json` | `A0CC1BBA40723AAD4B8B867CC8E9BE155B43842C3DAAE327ACA327DE970678F3` |
| `v019-qa-ejx-focused.raw.txt` | `1EDD46F9E1DF64BDD81AF5FB4AEECA2EA1831366A84009DD2C24551E5489CF02` |
| `v019-qa-ejx-negative-probes.js` | `9309CD08F910F90A16154F807B349B39F98CFD54DB21AA6D99D3E98D35D0FCBE` |
| `v019-qa-ejx-negative-probes.raw.json` | `974261397A2F0D3FA969E880157CFEF0AB56570735714EB4232014F3C646036F` |
| `v019-qa-ejx-postverify.raw.json` | `A0CC1BBA40723AAD4B8B867CC8E9BE155B43842C3DAAE327ACA327DE970678F3` |
| `v019-qa-offline-guard.cjs` | `7DB5BA483124A89B63699BBAE4C851414F9F8129A3FF71E84C760FEB8D509F45` |

保持 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`，旧 `y201tO`/`mdmmhK` 冻结不覆盖。后续新包须另行独立复核，局部隔离测试不能授权真实 HTTP 或采集。
