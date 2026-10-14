# v172 Windows 常驻服务阶段 B1：API 服务账户验收失败

- 执行日期：2026-09-17
- 结论：**FAIL / 已停止并回滚**
- 边界：仅尝试安装 `PublicOpinionApi`；未安装或启动 Worker，未改旧任务，未 push、合并、tag、发版、删除数据或补跑；未读取或回显秘密。

## 安装前门禁

- QA `v171_validate_artifacts_deployment_acl_independent_acceptance.md`：PASS。
- Windows PowerShell 5.1 / pwsh、v164、v169、独立 validate、四个 dry-run：已通过开发与 QA 复验。
- 3306 / 4320 / 3001：均为 `::` 唯一监听；API `/health` HTTP 200、DB `ok`。
- API / Worker：均 SCM `1060`；ProgramData 服务目录 0 文件。
- 旧任务：`Ready / Ready / Disabled`。

## API-only 安装与失败点

严格执行：

```text
scripts\windows-services\install-services.cmd /apply PublicOpinionApi
```

安装脚本与部署 ACL 校验均通过，WinSW 报告 `PublicOpinionApi` 安装成功，命令退出码 `0`。随后在启动服务前核验 SCM：

| 检查项 | 结果 |
| --- | --- |
| XML serviceaccount | `NT AUTHORITY\LocalService` |
| SCM / Win32_Service StartName | `LocalSystem` |
| 启动类型 | Auto，DelayedAutoStart=1 |
| 恢复策略 | 5 / 30 / 60 秒重启 |
| WinSW SHA-256 | `05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA` |
| EXE/XML ACL | SYSTEM、Administrators FullControl；当前运维账户、LocalService ReadAndExecute |
| 日志 ACL | LocalService Modify；SYSTEM、Administrators FullControl |

SCM 实际身份为 `LocalSystem`，与低权限 `LocalService` 硬门槛不一致，因此立即判定失败。未启动新服务，未停止当前 npm API，未进入 4320 切换、正常重启或强杀恢复。

## 回滚结果

- `rollback-services.cmd /apply`：退出码 `0`。
- API / Worker：均恢复 SCM `1060`。
- `C:\ProgramData\PublicOpinion\services`：恢复 0 文件。
- 安装工件与包装器日志保全：`.temp/windows-services-stage-b1/failed-deploy-8/`。
- 3306 / 4320 / 3001 保持原监听；API DB `ok`。
- 旧计划任务保持 `Ready / Ready / Disabled`。

## 阻塞结论

WinSW 成功注册服务但没有把 XML 中的 LocalService 落到 SCM，形成权限提升风险。必须先独立定位 WinSW v2 服务账户配置为何未生效，并建立“安装后 SCM StartName=LocalService”的回归或安装期断言；在新门禁前不得再次真实安装或进入 Worker。
