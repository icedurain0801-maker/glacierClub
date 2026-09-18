# v180 Windows 常驻服务阶段 B1：最终 API-only 安装失败

- 执行日期：2026-09-17
- 结论：**FAIL / 已回滚并恢复原运行链路；终止后续 WinSW 重试**
- 边界：仅安装并尝试启动 `PublicOpinionApi`；未安装 Worker，未修改旧任务，未 push、合并、tag、发版、删除数据或执行补跑；未读取或回显秘密。

## 安装前快照与 preflight

- QA `v179_windows_services_preflight_independent_acceptance.md`：PASS。
- 3306 / 4320 / 3001：均为 `::` 唯一监听，API DB `ok`。
- API / Worker：均 SCM `1060`；ProgramData 服务目录 0 文件。
- 旧任务：`Ready / Ready / Disabled`。
- 同一开机状态紧邻执行 `install-services.cmd /preflight PublicOpinionApi`：PASS；隔离目录包含空格，完成后残留 0，SCM 与生产 ProgramData 未改变。

## 安装及启动前核验

仅执行 `install-services.cmd /apply PublicOpinionApi`，退出码 `0`。启动前结果：

| 检查项 | 结果 |
| --- | --- |
| SCM StartName | `NT AUTHORITY\LocalService` |
| StartMode / 延迟启动 | `Auto` / `DelayedAutoStart=1` |
| 恢复策略 | 5 / 30 / 60 秒重启 |
| WinSW SHA-256 | `05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA` |
| EXE/XML/工作目录/日志路径 | 全部绝对路径 |
| XML 账户节点 | 仅 `domain,user`，值为 `NT AUTHORITY` / `LocalService` |
| EXE/XML ACL | SYSTEM、Administrators FullControl；运维账户、LocalService ReadAndExecute |
| 日志 ACL | LocalService Modify；SYSTEM、Administrators FullControl |

## 失败点

平滑停止原 npm API 后启动 Windows 服务。WinSW 能以服务模式启动 Node，但 Node 在解析项目入口前失败：

```text
Error: EPERM: operation not permitted, lstat 'C:\Users\Administrator\AppData'
code: 'EPERM'
syscall: 'lstat'
path: 'C:\Users\Administrator\AppData'
```

WinSW 记录三次子进程启动：PID `6624`、`3864`、`22232`，与 5/30 秒恢复动作一致，但均因同一目录遍历权限失败；服务最终为 `Stopped`，4320 未恢复。未进入正常重启、手动强杀或三层服务托管验收。

根因边界：服务账户与目标文件 ACL 已正确，但项目位于用户配置目录深处；`LocalService` 无权遍历上层 `C:\Users\Administrator\AppData`。当前授权禁止修改生产 ACL，因此不得通过开放用户目录父级权限继续尝试。

## 回滚与恢复

- `rollback-services.cmd /apply`：退出码 `0`。
- API / Worker：均 SCM `1060`；ProgramData 服务目录 0 文件。
- 安装工件与日志：`.temp/windows-services-stage-b1/failed-deploy-9/`。
- 已复用 `npm run start:server` 恢复 API：4320 `::` 监听，PID `8080`，`/health` HTTP 200、DB `ok`。
- 3001 保持 `::` 监听，PID `25008`；外网真实 sources API HTTP 200、`dataCount=6`。
- 旧任务保持 `Ready / Ready / Disabled`。

## 替代方案评估

1. **推荐**：将 API 运行包放到机器级受控目录（例如 `C:\ProgramData\PublicOpinion\app`），只复制运行必需文件，以 LocalService 最小权限运行；需另行设计部署同步、依赖与 `.env` 安全存放方案。
2. 不推荐：给 LocalService 增加用户目录 `AppData` 及全部父级的遍历权限；这会扩大用户配置目录暴露面，且超出本单 ACL 冻结边界。
3. 可选：使用专用低权限服务账户并显式授予项目路径访问；需要额外凭据生命周期与服务登录权管理。

按“第六次且最后一次”门禁，当前不再进行任何 WinSW 真实安装重试，等待项目经理选择替代方案。
