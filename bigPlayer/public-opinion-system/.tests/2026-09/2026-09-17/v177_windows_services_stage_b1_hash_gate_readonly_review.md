# v177 阶段 B1 API-only hash 门禁命令失败：只读复核

- 复核日期：2026-09-17
- 复核角色：测试负责人
- 范围：只读核对 `v176` 失败报告、SCM 服务状态、实际服务目录、端口及 API 健康状态。
- 禁止项执行情况：未重试安装，未操作服务、Worker、旧任务、进程、数据库、`.env`、ACL 或发布状态。

## 复核结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| hash 门禁失败点 | CONFIRMED | `v176` 记录 `for /f` 无法解析含空格的 Windows PowerShell 绝对路径；退出码 2，发生在复制工件与 WinSW install 前。 |
| API 回滚 | PASS | `PublicOpinionApi` 为 SCM 1060 / 不存在。 |
| Worker 未误安装 | PASS | `PublicOpinionWorker` 为 SCM 1060 / 不存在。 |
| 实际服务目录 | PASS | `C:\ProgramData\PublicOpinion\services` 文件数为 0。 |
| 基础运行态 | PASS | 3306、4320、3001 均监听；`http://127.0.0.1:4320/health` 返回 HTTP 200，数据库状态为 `ok`。 |

## 结论

FAIL 保持成立，回滚复核通过。下一次真实安装前，开发负责人必须修复带空格 `POWERSHELL_EXE` 路径下的 batch hash 门禁命令，并新增覆盖 `/apply` 分支实际命令解析的隔离回归；修复和 QA 通过前禁止再次 `/apply` 或进入 Worker。
