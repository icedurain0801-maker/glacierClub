# v019 QHBPyb 隔离侦察 runner 独立 QA

Status: ISOLATED_NO_PASS / RETURN_TO_DEV / FULL_RUNTIME_NO_GO / CUTOVER_HOLD

Date: 2026-10-10 (Asia/Shanghai)

## 冻结完整性与执行

- 冻结根：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-v019-isolated-candidate-QHBPyb/`；manifest SHA256 `f482137315f5d184ba80d92da224a10982fc94e0a4f42a4e8342b4694c5ab363`。
- runner 15642 bytes / SHA256 `aab0824bd787bcb80552ecf1ce482d8f6db05342cc67f8acddf77bf7aead2797`；测试 6527 bytes / `a86950642ec7b6b24116f0d8cd57fac3686ef8d42322b2848ead74ca4b428d22`；guard 937 bytes / `2f801b5051c08b93dadfff9322f7cca4090c23234a915b57fd95eef0844208d9`。前置、后置 bytes/SHA 全部一致；目录仅 manifest 加三文件。
- 开发原件 `.temp/overseas-v019-isolated-qa-qwaVrv/result.json` SHA256 `68527e11e57d95441b0fdf6887d75c00d93daa23a7a26fa2793718b27882dea9`，确为 `DEV_TEST_EVIDENCE`，开发 13/13、unchanged=true；不代替独立签收。
- 在冻结目录以 `node --require ./scripts/v019-offline-network-guard.cjs --test server/test/overseasV019IsolatedRunner.test.js` 独立连续两轮运行，均 exit 0、13/13。独立负测 12 项中 11 项通过、1 项 `FAIL_NESTED_SYMBOL_SILENTLY_DROPPED`，exit 1。

## 退回缺陷

**P2：嵌套 symbol accessor 未拒绝，快照静默丢弃。** `dataSnapshot` 使用 `Object.entries(Object.getOwnPropertyDescriptors(value))` 遍历，忽略 descriptor 对象的 symbol 键。独立负测在 `account` 上加可枚举 symbol getter，`run` 最终成功而非返回输入拒绝错误，getter 调用数为 0。这里**没有执行 getter、没有网络副作用**；但“嵌套快照拒 accessor / symbol 键拒绝”的声明式输入合同仍未闭合，顶层 `Reflect.ownKeys` 校验不能覆盖嵌套对象。请开发对嵌套自有键也用 `Reflect.ownKeys` 校验并补回归，新包重新冻结后再独立验收。不可修改本冻结。

## 已验证的局部行为与限制

- 旧 ZlQ9KK 顶层 getter P1 已修：9 种顶层 getter、source/account/fixture/站点嵌套字符串 getter 全部在执行前拒绝，调用计数 0；普通注入 transport 与 fixture 函数也未调用。顶层 symbol、未知键、继承输入和嵌套非普通对象被拒绝。
- transport + JSON 共用截止：30ms + 30ms 延迟在 45ms 上限下约 47ms 中止；12ms 总 timer 只进入首请求；超大 timeout 被限制为 10s/5m，三站合成请求 24 次。精确数字 comment ID、postId 一致性、未知 query、token/原始内容 ID 脱敏均通过独立负测。
- unknown 三站仅模拟 tokenExchange/context/board 共 9 次，feedCount=0；未准许探针的 unknown、disabled、unauthorized 均拒绝。`ISOLATED_SYNTHETIC_PASS` 对此只表示合成认证预检流程走完，**不是 feeds、真实身份授权或实际采集完成**。
- 本轮仅可信声明式 fixture 和离线 guard。Object 反射不是恶意 Proxy 无副作用沙箱；实际 site/account HMAC 签发、真实 transport、抓取、去重幂等、入库和异步 AI 未验。继续 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`，不得升级为真实侦察或生产 GO。未使用真实 HTTP/token/provider/AI/SQL/DDL/服务、国内 Worker 或其他平台。

## 独立原件

| 仓库根 `.temp` 文件 | SHA256 |
| --- | --- |
| `v019-qa-qhbpyb-frozen-round1.raw.txt` | `59630e052f4c37c4f4320029c939b2700859b2123dfea8291d9274fdfa6dd534` |
| `v019-qa-qhbpyb-frozen-round2.raw.txt` | `66ac6d396904c66f1f7fe55ca15ba2b828a422f0f5a093264a48011a9e724b51` |
| `v019-qa-qhbpyb-negative-probes.js` | `79549f1141e4416c20b1fb7888410b6db2d80e4795da1ab9eec50887e01023d0` |
| `v019-qa-qhbpyb-negative.raw.json` | `6f84a97f6d422ee8ad67ad39f0b9f4b30cee944f7868803a0cb762317fcf6cbf` |

旧 ZlQ9KK 与更早冻结及 QA 原件保留；本次不借用旧包结论。
