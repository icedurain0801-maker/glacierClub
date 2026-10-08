# v023 TapTap Worker-only B 参数门禁修复

## 范围

修复 `worker-only-controlled-cutover.js` 对 B 阶段只读 API 不变性对照参数的误拒绝。第六候选
`worker-release-taptap-20260920-sixth6b1`、其 release、snapshot 和 audit 均只读保留，未续跑 B。

## 变更

- `--api-wrapper`、`--api-xml` 仅作为 snapshot/hash 前后对照的必填观察参数；非 fake 模式仍必须精确指向固定 API 工件路径。
- 其余携带 API/3001 意图的参数（包括 API target/source/copy/switch/service）在输入处理前返回
  `WORKER_ONLY_TARGET_REJECTED`。
- `verifyInputs`、snapshot hash 比对及 preflight 的 API 不变性断言保持不变。

## 验证

- `node --test .tests/2026-09/2026-09-20/v229_worker_only_controlled_cli.test.js`：14/14 PASS。
- 夹具使用 `PublicOpinionApi.exe` / `PublicOpinionApi.xml` 文件名验证第六次 B 所需参数不再被误拒绝；API target 与 API service 意图仍返回 exit 5。
- `node --check scripts/windows-services/worker-only-controlled-cutover.js` 与 `git diff --check` 通过；测试夹具在 finally 清理，无残留。

## 边界

未执行真实 B/D、服务控制、重启、补跑或候选目录写入。第七次真实 C+B 继续冻结，须先由测试负责人独立复核并由项目经理重新授权。
