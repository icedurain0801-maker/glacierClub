# v176 Windows 常驻服务阶段 B1：API-only hash 门禁命令失败

- 执行日期：2026-09-17
- 结论：**FAIL / 已停止并回滚**
- 边界：仅尝试安装 `PublicOpinionApi`；未安装 Worker，未修改旧任务，未 push、合并、tag、发版、删除数据或补跑；未读取或回显秘密。

## 安装前快照

- QA `v175_winsw_service_account_contract_independent_acceptance.md`：PASS。
- 3306、4320、3001 均为 `::` 唯一监听；API `/health` HTTP 200、DB `ok`。
- API / Worker 均 SCM `1060`；`C:\ProgramData\PublicOpinion\services` 文件数 `0`。
- 旧任务保持 `Ready / Ready / Disabled`。

## 失败过程

严格执行：

```text
scripts\windows-services\install-services.cmd /apply PublicOpinionApi
```

安装脚本在复制工件和调用 WinSW 前执行 SHA-256 门禁，但 `for /f` 中带引号的 Windows PowerShell 路径解析失败：

```text
'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "' is not recognized as an internal or external command,
operable program or batch file.
WinSW SHA-256 mismatch.
```

- 命令退出码：`2`。
- 失败阶段：部署前 hash 校验。
- 未复制 EXE/XML，未调用 WinSW `install`，未创建或启动服务。
- API / Worker 随后均为 SCM `1060`。

该结果说明 dry-run 和静态门禁没有执行 `/apply` 分支中的实际 `for /f` 命令，未发现带空格可执行路径的批处理引号问题。

## 回滚结果

- `rollback-services.cmd /apply`：退出码 `0`。
- API / Worker：均 SCM `1060`。
- ProgramData 服务目录：0 文件。
- 3306 / 4320 / 3001 保持监听；API DB `ok`。
- 旧任务保持 `Ready / Ready / Disabled`。

## 阻塞结论

必须先修复并隔离测试 install 的 hash 门禁命令调用方式，覆盖默认 Windows PowerShell 绝对路径含空格场景；新门禁前不得再次执行 `/apply` 或进入 Worker。
