# v242 TapTap Stage C 候选准备受控入口验收

- 测试日期：2026-09-20（北京时间）
- 测试类型：PowerShell 隔离 dry-run/故障注入合同
- 边界：无 C/B 授权；未写 ProgramData、未控制服务、未运行真实 preflight/apply、未执行 stop/install/start/rollback

## 结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| clean baseline 与单一 TapTap hunk | PASS | 合同脚本强制 clean baseline，校验 `worker/src/worker.js` 单一 TapTap commit/patch SHA |
| WinSW 固定 hash/nonreparse | PASS | dry-run 校验固定 WinSW hash、非链接/非 reparse 输入 |
| candidate ID 不可变 | PASS | 生成 `worker-release-taptap-contract-20260920` 候选目录并固定 release/staging/audit 路径 |
| C-only 产物 | PASS | 仅写入临时 `releases`、`candidate-staging`、`audit`；生成 `verified-snapshot.json` 与 B preflight 参数 |
| 真实 Prepare 默认拒绝 | PASS | 本轮未获得授权，未运行真实 Prepare；合同入口保持拒绝 |
| dry-run | PASS | 输出 `status=DRY_RUN_PASS`，列出候选、服务材料和 preflight 参数 |
| 故障注入 | PASS | 注入 hash failure 返回 `STAGE_C_REJECTED`，并保留失败证据 |
| 禁止服务动作 | PASS | 测试确认失败不删除已有 release、不调用 stop/install/start/rollback |

## 结论

TapTap Stage C 候选准备入口 **PASS（隔离合同）**。仅证明 C 阶段候选生成和失败留证安全；真实 C、B 预检及 D 发布仍需独立授权，不能据此宣称可发布或已切换。
