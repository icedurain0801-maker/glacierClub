# v019 ZlQ9KK 隔离侦察 runner 独立 QA

Status: ISOLATED_NO_PASS / RETURN_TO_DEV / FULL_RUNTIME_NO_GO / CUTOVER_HOLD

Date: 2026-10-10 (Asia/Shanghai)

## 冻结与执行

- 冻结根：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-v019-isolated-candidate-ZlQ9KK/`；manifest SHA256 `b088b6122e341f547ea8451fc1de94f5ac016f1189b7d1e678c31a4717f64f9d`。
- manifest 列出的 runner 13983 bytes / `4827173f38ed39ee869c252342129310edf9ebaeca6556c86a34321cfdf6e9a6`；测试 5234 bytes / `f158ac6810c7319afa5b79875329e8a2a89304991392fd6e3923c0b2cd23302f`；guard 937 bytes / `2f801b5051c08b93dadfff9322f7cca4090c23234a915b57fd95eef0844208d9`。前后均匹配；目录只有 manifest 加上述三文件。
- 开发原件 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-v019-isolated-qa-JCsRch/result.json` SHA256 `e489dad21a1f34e440b7c515de2fd993445fbcb38097df9cadad5a5f730abe82`，其 `kind=DEV_TEST_EVIDENCE`、exitCode 0、10/10。该原件不代签独立 QA。
- 冻结 guard 下 `node --require ./scripts/v019-offline-network-guard.cjs --test server/test/overseasV019IsolatedRunner.test.js` 连续两轮均 exit 0、10/10。独立合成负测 exit 0，其中一项明确记录 `FAIL_GETTER_EXECUTED`；exit 0 仅代表探针程序完整运行，不是验收通过。

## 阻断缺陷

**P1：顶层注入属性 getter 在入口拒绝之前执行。** `run({ ..., transport: injectedTransport, ... } = {})` 在函数体入口 guard 前读取调用方的 `transport` 属性。独立测试传入本地计数 getter，观察 `getterCalls=1`，随后才收到 `SYNTHETIC_TRANSPORT_REQUIRED`。没有实际联网或执行任何危险回调；但若 getter 有副作用，离线 guard 只是常用网络入口的事故预防，无法把“拒绝回调且不执行 getter”变成 runner 保证。应在读取值前用属性描述符验证顶层输入并拒绝 accessor/非数据对象，补回归后重新冻结、重新独立验收。原冻结文件不修改。

## 局部通过与界限

- 普通注入 callback 未调用；fixture accessor 与函数未调用。共享请求截止在 transport 30ms + JSON 30ms、请求上限 45ms 下约 51ms 中止，返回 `ABORTED`；固定调用方 `now` 无法延长 12ms 批次。调用方的超大 timeout 被压回 10s/5m，合成三站计 24 请求。
- unknown + `allowAuthProbe=true` 三站各仅 tokenExchange/context/board，共 9 请求、feedCount 0；未允许探针的 unknown、disabled、unauthorized 均拒绝。comment 数字单段 ID 与 postId 必须相同，额外路径、非数字 ID、未知 query 均拒绝；报告与脱敏日志未含本次合成 root token/原始 post ID。
- `ISOLATED_SYNTHETIC_PASS` 只是声明式 fixture 的隔离预检结果，尤其 unknown 成功不代表 feeds 已执行。冻结身份只检查调用方提供的 SRC-A/board/站点字段，不是实际授权签发；真实身份、transport、账号、抓取、去重入库与异步 AI 均未验收。不得用该局部结果放行真实侦察或切流。
- 全程仅离线 guard 与合成数据；未启动服务，未碰真实 HTTP/token、SQL、AI、生产配置、任务、数据或国内 Worker/其他平台。

## QA 原件

| 统一根 `.temp` 文件 | SHA256 |
| --- | --- |
| `v019-qa-zlq9kk-frozen-round1.raw.txt` | `167bd6c4fe2753914d85b891c8f6fc694f227d16e6093dbef38069c30723674c` |
| `v019-qa-zlq9kk-frozen-round2.raw.txt` | `06ea22479353b72ea0c145ac84a8075e46f651b0161a674d915d1c1c699a289f` |
| `v019-qa-zlq9kk-negative-probes.js` | `2919469fee17b9c52b61d79f3aee5d6f6522d2571cdae18788aa4f4260f82f3b` |
| `v019-qa-zlq9kk-negative.raw.json` | `4fcf72c3d914fd5f40eb5d19225c31d542da7cb04789737fc3e7d2f2459616eb` |

旧 `y201tO`、`EJxUjH` 报告与冻结不覆盖。退回开发负责人修复入口属性读取，项目经理继续保持 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`。
