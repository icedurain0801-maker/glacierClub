# v243 TapTap C+B 候选准备全隔离证据复核

- 测试日期：2026-09-20（北京时间）
- 测试类型：PowerShell full-isolation 合同
- 边界：真实 C/B 未授权；未写 ProgramData，未控制服务，未运行真实 preflight/apply、补跑或发版

## 结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| C 入口授权门禁 | PASS | 缺少授权在 ProgramData 写入前返回 `C_B_UNAUTHORIZED` |
| production pin | PASS | production pin 保持不变，非 isolation override 被拒绝 |
| TapTap-only 候选 | PASS | 合同要求 clean baseline、唯一 tracked `worker.js` hunk、候选/patch SHA 和固定 WinSW lock |
| full isolation 产物 | PASS | 临时根生成 release、candidate-staging、audit；覆盖 405 files、XML、ACL、manifest、snapshot、B 参数 |
| hash/XML/path/snapshot 失败 | PASS | 失败写入 `failure.json`；XML/snapshot 失败保留 release 与 staging |
| 服务安全边界 | PASS | 测试未调用 stop/install/start/rollback，不连接真实服务/API/3001/DB |
| 合同测试 | PASS | PowerShell `v240_taptap_stage_c_candidate_prepare_contract.test.ps1` 输出 `DRY_RUN_PASS` 与失败注入 `STAGE_C_REJECTED`，最终 PASS |

## 结论

TapTap C+B 候选准备全隔离合同 **PASS**。本结果只证明授权门禁、候选材料、snapshot/B 参数和失败留证安全；真实 C/B preflight、授权 apply 和发布仍未执行，不能报发布就绪或线上切换完成。
