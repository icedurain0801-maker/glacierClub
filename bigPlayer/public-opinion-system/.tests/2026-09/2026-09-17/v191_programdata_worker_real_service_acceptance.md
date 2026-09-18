# v191 ProgramData Worker 真实服务验收

- 日期：2026-09-17
- 结论：运行与恢复主链路 PASS；历史心跳退役机制风险待单独立项

## 验收证据

| 项目 | 结果 | 证据 |
|---|---|---|
| 发布闭包与篡改拒绝 | PASS | 405 文件；`v188_worker_release_preflight.test.ps1` PASS |
| Worker 预检 | PASS | release、ACL、Node/Python、只读 schema/lease/epoch readiness 全部 PASS |
| 生产构建标识 | PASS | 心跳 `build_sha=A106...D4418`，与 manifest 文件 SHA-256 一致 |
| 服务账户与启动策略 | PASS | `LocalService`；Automatic Delayed；失败恢复 5/30/60 秒 |
| 正常 stop/start | PASS | wrapper PID `32780 -> 30680`，新心跳 11 秒内恢复 |
| 强杀恢复 | PASS | Node PID `25168` 强杀后，wrapper `34060` / Node `34400` 恢复，新心跳 14 秒内完成 |
| MySQL 短时中断 | PASS | MySQL PID `6064 -> 24780`；API PID `31216`、Worker wrapper PID `34060` 均未变化；DB 恢复 `ok` |
| 有界补跑与防重复 | PASS | 连续两个周期 catchup 总数固定 41；相同 `source_id, scheduled_at` 重复 0 |
| 最新 Worker 状态 | PASS | `mode=enabled`，最近扫描 `completed`、无错误、租约已释放，心跳年龄 32 秒 |
| 页面/资源/API | PASS | 外网页面 200/26001 bytes；CSS 200/7025 bytes；API 200/12451 bytes |
| 保护项 | PASS | API 未重启；旧任务保持 `Ready / Ready / Disabled` |

## 剩余风险

故障演练产生了多个历史 `worker_id` 心跳行。最新实例正常且单进程运行，但历史行缺少退役语义，可能触发现有 `listWorkerAlerts` 的超时结果。本次不删除数据、不扩展需求，需由项目经理另行派单。
