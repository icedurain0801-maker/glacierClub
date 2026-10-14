# v167 Windows 常驻服务阶段 B1：API-only ACL 校验自动加载失败

- 执行日期：2026-09-17
- 结论：**FAIL / 已停止并回滚**
- 边界：仅尝试安装 `PublicOpinionApi`；未安装 Worker，未停用或删除旧任务，未 push、合并、tag、发版、删除数据或执行补跑；未读取或回显任何秘密。

## 安装前快照

| 检查项 | 结果 |
| --- | --- |
| 3306 | `::3306`，PID `6064` |
| 4320 | `::4320`，PID `26236`；`/health` HTTP 200、DB `ok` |
| 3001 | `::3001`，PID `25008` |
| PublicOpinionApi / Worker | 均 SCM `1060` |
| ProgramData 服务目录 | 文件数 `0` |
| 旧计划任务 | `Ready / Ready / Disabled` |
| PendingFileRenameOperations | 条目数 `2`，未读取内容 |

## 失败过程

严格执行：

```text
scripts\windows-services\install-services.cmd /apply PublicOpinionApi
```

未传入 `PublicOpinionWorker` 或 `All`。渲染完成后，`validate-artifacts.ps1 -DeploymentRoot ... -TargetService PublicOpinionApi` 进入 ACL 检查，调用 `Get-Acl` 时 PowerShell 报错：

```text
The 'Get-Acl' command was found in the module 'Microsoft.PowerShell.Security',
but the module could not be loaded.
```

命令退出码 `1`，失败发生在 WinSW `install` 前；两个服务随后仍为 SCM `1060`。

该结果证明 v164/v166 的无 `DeploymentRoot` 回归只覆盖了隔离 XML 渲染和 dry-run，没有覆盖 `Assert-AllowedAcl` 中的 `Get-Acl` 实际调用，不能作为真实安装前 ACL 路径的充分验收。

## 回滚与运行态

- `rollback-services.cmd /apply`：退出码 `0`。
- 本次生成工件与包装器日志保全至 `.temp/windows-services-stage-b1/failed-deploy-7/`。
- `C:\ProgramData\PublicOpinion\services`：恢复为 `0` 个文件。
- API / Worker：均 SCM `1060`。
- 3306、4320、3001 保持原监听；API DB 健康仍为 `ok`。
- 旧任务仍为 `Ready / Ready / Disabled`。

## 阻塞结论

本轮未进入服务创建、平滑切换、正常重启或强杀恢复。按失败即停门禁，不在同一安装单内继续修改或重试；后续修复必须新增带 `DeploymentRoot` 的 ACL 路径回归，且在重新开放真实安装门禁前不得再次执行 `/apply`。
