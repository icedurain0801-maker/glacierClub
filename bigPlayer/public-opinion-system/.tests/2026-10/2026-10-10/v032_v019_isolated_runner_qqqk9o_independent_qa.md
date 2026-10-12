# v019 Qqqk9O 隔离侦察 runner 独立 QA

Status: ISOLATED_SYNTHETIC_CONTROLLER_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD

Date: 2026-10-10 (Asia/Shanghai)

## 签收范围与冻结完整性

仅签收本冻结的**可信声明式 fixture + 离线 guard 下的合成控制器**，不签真实账号授权、身份签发、网络 transport、采集、去重入库、异步 AI、生产或切流。冻结根 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-v019-isolated-candidate-Qqqk9O/`，manifest SHA256 `bea226b2f9c315d177d2fa15425dc6d24e55cd70fa3c4129f0b2f07e1549ee60`。

| 冻结文件 | bytes | SHA256 |
| --- | ---: | --- |
| `scripts/overseas-v019-isolated-runner.js` | 15825 | `4643937d53ba51a116b0f63757a763370311284140eea151b88b952348119a95` |
| `server/test/overseasV019IsolatedRunner.test.js` | 7571 | `b6ef2aa4ffff074fa9f32d16df8118a1a4521d82c203a3cceae971b9b7798d10` |
| `scripts/v019-offline-network-guard.cjs` | 937 | `2f801b5051c08b93dadfff9322f7cca4090c23234a915b57fd95eef0844208d9` |

前后 bytes/SHA 全匹配，目录仅 manifest 加上述三文件。开发 `.temp/overseas-v019-isolated-qa-hiqTEQ/result.json` SHA256 `c4d0297d1349098f1d84a75a00355204fc24a938f6c30db5fb5bc77ef32d9ddd`，实际 `kind=DEV_TEST_EVIDENCE`、14/14、exitCode=0、unchanged=true；只作为交接对照，不代独立签收。

## 独立执行结果

- 冻结 guard 命令 `node --require ./scripts/v019-offline-network-guard.cjs --test server/test/overseasV019IsolatedRunner.test.js` 连续两轮均 exit 0、14/14。
- 独立负测 12/12、exit 0；上一包 QHBPyb 的嵌套 symbol 静默丢弃缺陷已关闭。六类位置（account/source/site/sites/fixture/更深层）乘数据/accessor、可枚举/不可枚举的 24 种组合均拒绝，getter 调用 0。顶层与嵌套字符串 getter、外部 handler/fixture 函数亦未执行；顶层 symbol、未知键、继承输入和嵌套继承对象拒绝。
- 单请求 transport + JSON 共享 deadline：30ms + 30ms 模拟延迟、45ms 限制约 49ms 中止。总 timer 12ms 仅进入首请求；调用方超大 timeout 被限制为 10s/5m。合成完整路径总 24 次、三站各 8 次。评论数字单段 ID 与 postId 一致性、未知 query 拒绝，报告及脱敏日志不含本次原始 token/内容 ID。
- unknown 三站只模拟 tokenExchange/context/board 共 9 请求、feedCount=0；unknown 未准许探针、disabled 和 unauthorized 均拒绝。这里的 `ISOLATED_SYNTHETIC_PASS` 仅指合成预检流程，绝不表示 feeds、真实授权或实际抓取完成。

网络 guard 是可信测试的误联网防护，不是恶意 JavaScript/Proxy 的无副作用沙箱。真实 site/account HMAC 签发、transport、账号与完整运行证据尚未验收，保持 `FULL_RUNTIME_NO_GO / CUTOVER_HOLD`。本次未用真实 HTTP/token/provider/AI/SQL/DDL/ACL/服务、国内 Worker 或其他平台；v104 不混验。旧冻结与旧 QA 原件保留。

## 独立原件

| 仓库根 `.temp` 文件 | SHA256 |
| --- | --- |
| `v019-qa-qqqk9o-frozen-round1.raw.txt` | `afe7d919fe3a23225bb9efe291c9848c3e81291b6aa61e1945c645cb6a450b85` |
| `v019-qa-qqqk9o-frozen-round2.raw.txt` | `f114fe05f4075dfd7302014d00f07c254f7a31316ba7417ab82db9c9bacf7076` |
| `v019-qa-qqqk9o-negative-probes.js` | `33bc8aaee3babf1560f5be706693e5130f977ad7d79220a3428de4e42895c22a` |
| `v019-qa-qqqk9o-negative.raw.json` | `3872823099e6308e05f06ca7ae204753e275e92dfa765e2c2b0506b9eee4484f` |
