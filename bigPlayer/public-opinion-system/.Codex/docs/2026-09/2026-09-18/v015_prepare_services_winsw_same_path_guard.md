# v015 WinSW 源/目标同路径保护

## 变更

- `scripts/windows-services/prepare-services.ps1` 新增 `Assert-DistinctFilePath`。
- API 包装器目标固定为 `$effectiveServiceRoot\PublicOpinionApi.exe`；在创建 release、服务目录、日志目录或复制 WinSW 前，比较已解析的发布源二进制与该目标的绝对路径。
- 两者完全相同（大小写不敏感）时 fail-closed，错误中包含被拒绝的路径；不同路径继续原有的 SHA-256、release、渲染与 ACL 门禁。

## 离线验证

- `powershell -NoProfile -ExecutionPolicy Bypass -File .tests/2026-09/2026-09-18/v210_prepare_services_winsw_same_path_guard.test.ps1`
- 结果：PASS。测试以 PowerShell AST 解析目标脚本，执行其中实际的路径保护函数，验证大小写不同的同一路径被拒绝、不同路径可通过，并断言保护调用在 release 构建与服务目录写入之前。

## 边界

- 未执行 `Apply`，未启动、停止或重启 3001，未部署、未修改数据库、未调用 provider、未触发采集或授权、未 push。
- 下一次受控发布前仍需：项目经理重新授权发布窗口；确认 WinSW 发布源位于独立的已校验二进制路径，且不等于目标 `C:\ProgramData\PublicOpinion\services\PublicOpinionApi.exe`；保留现有 release 回滚包，并在发布前完成既有版本/hash/manifest 预检。
