---
status: READONLY_MISMATCH_CONFIRMED
date: 2026-09-22
role: development-lead
---

# BigPlayer Worker release 绑定只读核对

## 安全边界

- 仅读取服务 XML、release manifest、进程命令行和已有 audit 文件。
- 未重启、未切换服务、未发布、未创建真实 Run、未写 DB。
- 未读取进程环境 secret、密码、token 或 credential 密文。

## 来源 → 应运行 Worker → 实际运行 Worker

| 项目 | 只读证据 | 结论 |
|---|---|---|
| BigPlayer 目标来源 | `source=5c21...` / `081a...`，代码目标为 BigPlayer `scheduled_catchup` 与 account subject | 应由包含 BigPlayer 调度与凭据主体接线的 Worker release 执行 |
| Worker 服务配置 | `C:\ProgramData\PublicOpinion\services\PublicOpinionWorker.xml`：arguments 指向 `worker-release-taptap-20260921-v055-formal1\worker\src\worker.js`；workingdirectory 同 release；`UNIFIED_SOURCE_SCHEDULER_MODE=enabled` | 服务声明的 Worker 是 TapTap formal1 release，不是 v334/v333 BigPlayer release |
| 实际 Worker 进程 | PID `32020`，启动 `2026-09-21 18:01:02`；命令行同样指向 `worker-release-taptap-20260921-v055-formal1\worker\src\worker.js` | 实际运行与服务配置一致，但与本次 BigPlayer 正式候选不一致 |
| API/DB 配置声明 | `C:\ProgramData\PublicOpinion\config\public-opinion.env` 声明 `DB_HOST=127.0.0.1`、`DB_NAME=public_opinion`；服务 XML 未声明独立 DB 覆盖 | 只能证明配置文件声明，不能证明 PID 32020 已加载该文件；未读取进程环境 |
| release manifest | 实际 release 存在 `package-worker-release-manifest.json`；当前 PID 无 v334 evidenceId | 无同版 v334 BigPlayer Worker 运行证据 |

## 根因结论

当前高 FAIL 的凭据链问题不能继续归因用户未录入账号。数据库 source→account→credential 外键链已通过只读核对；但实际 Worker 仍是 TapTap formal1 release，无法证明加载了当前 BigPlayer account subject 接线和目标 commit。最小修复范围是发布/启动同版 BigPlayer Worker，并在发布后只读记录其 commit、路径、DB 配置指纹和非敏感 credential subject 审计字段；本报告不执行该切换。

## 当前门禁

- `scripts/init-release-candidate.test.js` 仍为 `5/6`，未达到 `6/6`。
- v334c 已封存，禁止交测、发布、真实 Run、DB 写和 3001 访问。
