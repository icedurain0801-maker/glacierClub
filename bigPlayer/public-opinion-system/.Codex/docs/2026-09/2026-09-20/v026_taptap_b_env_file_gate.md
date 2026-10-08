# TapTap B 显式环境文件门禁

## 范围

修复第八个 TapTap 候选在 B 只读预检中遗漏 `--env-file` 的参数链。

## 变更

- Stage C 将已验证、非 reparse 的现有 Worker 环境文件规范化为绝对路径，写入 verified snapshot（路径和 SHA-256），并在 B 参数中显式输出 `--env-file`。
- 参数列表在 `--env-file` 前加入 Node 参数终止符 `--`，避免 Node 将该参数当作自身的 `--env-file` 选项解析。
- B CLI 只接受与 snapshot 路径和哈希完全一致的普通文件；不再允许从进程环境隐式取得环境文件。
- 缺参、不存在、目录、reparse、路径不匹配或文件内容变化均 fail-closed；不会读取或输出环境文件内容。

## 验证

- `node --test .tests/2026-09/2026-09-20/v229_worker_only_controlled_cli.test.js`：21/21 PASS。
- Windows PowerShell 5.1 隔离 B 入口回归通过。
- `node --check scripts/windows-services/worker-only-controlled-cutover.js`、PowerShell 5.1/pwsh 解析及 `git diff --check`：PASS。

## 边界

未触碰第八候选、ProgramData、服务、B/D 实际运行、重启或补跑。第九候选真实 C+B/D 仍须经独立 QA 流转。
