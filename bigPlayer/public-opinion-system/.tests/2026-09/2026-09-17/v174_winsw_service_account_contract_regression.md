# v174 WinSW 服务账户契约回归

- 日期：2026-09-17
- 结论：**开发自测 PASS，等待独立 QA**
- 边界：仅修改 WinSW 模板、校验与安装门禁；仅在仓库根 `.temp` 创建隔离 fixture。未执行 `/apply`，未安装服务，未修改旧任务、数据库、`.env` 或生产 ACL，未 push 或发版。

## 修复内容

- API/Worker 模板将旧 `<username>` 改为 WinSW v2 的 `<domain>NT AUTHORITY</domain><user>LocalService</user>`。
- 校验器在模板、隔离渲染、DeploymentRoot 三处严格要求 serviceaccount 仅含 `domain/user`，拒绝旧 `username`、`LocalSystem`、缺失和未知节点。
- 安装脚本在部署前锁定 WinSW v2.12.0 SHA-256：`05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA`。
- WinSW `install` 后、任何服务启动前查询 SCM `SERVICE_START_NAME`；规范化大小写和空格后只接受 `NT AUTHORITY\LocalService`。不匹配时自动保全非敏感 EXE/XML/包装器日志和账户摘要，并卸载本轮目标服务，退出非 0。
- 单服务与 `All` 的部署成功文案按实际校验范围输出。

## 新回归

`v173_winsw_service_account_contract.test.ps1` 覆盖：

- 新 API/Worker 渲染及 DeploymentRoot 校验 PASS，同一 Windows PowerShell 进程连续两次。
- `failed-deploy-8/PublicOpinionApi.xml` 的旧 `username` 配置必须 FAIL。
- `LocalSystem`、缺失 `user`、未知 `allowservicelogon` 节点必须 FAIL。
- 正向 fixture 的 hash、mtime、ACL 不变；负向验证不改输入；fixture 与渲染探针残留均为 0。

## 验证结果

| 验证 | 结果 |
| --- | --- |
| Windows PowerShell 5.1：v173 | PASS |
| Windows PowerShell 5.1：既有 v169 / v164 / 独立 validate | PASS |
| pwsh 7.6.5：既有 v164 / 独立 validate | PASS |
| install/uninstall/status/rollback dry-run | 全部退出码 0 |
| account/ACL/render fixture 残留 | 全部 0 |
| `git diff --check` | PASS |

## 开发过程失败记录

v173 首次运行的 `MissingUser` 夹具构造将 XML 节点值字符串传给 `RemoveChild`，触发：

- ErrorRecord：`Cannot convert argument "0", with value: "LocalService", for "RemoveChild" to type "System.Xml.XmlNode"`
- Category：`NotSpecified`
- FullyQualifiedErrorId：`MethodArgumentConversionInvalidCastArgument`
- Windows PowerShell：`5.1.19041.3803`
- `PSModulePath`：`C:\Users\Administrator\Documents\WindowsPowerShell\Modules;C:\Program Files\WindowsPowerShell\Modules;C:\Windows\system32\WindowsPowerShell\v1.0\Modules`
- `Microsoft.PowerShell.Security`：`3.0.0.0`，路径 `C:\Windows\system32\WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1`

该失败仅发生在临时负向 fixture 的构造阶段，`finally` 已清理；改用 `SelectSingleNode('user')` 取得 XmlNode 后重跑，全套 PASS。
