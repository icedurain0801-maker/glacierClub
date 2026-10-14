# v043 BigPlayer API cutover 候选独立 QA

- CandidateId：`v043-bigplayer-api-cutover-20260921-0025`
- 候选：`.temp/candidates/v043-bigplayer-api-cutover-20260921-0025`
- Hermetic：`.temp/hermetic-runs/v043-bigplayer-api-cutover-20260921-0025-copy`
- manifest SHA256：`25E8C9FFDA5C2363BB6FB46BB5493FA286905D50B5E05EEE944D67E04927D821`
- 总结：`FAIL`

## 已通过

| 检查 | 结果 |
|---|---|
| manifest 完整性 | PASS：527 条文件；0 hash mismatch；0 extras；0 reparse；0 绝对工作树路径 |
| 候选 verifier | PASS：hermetic verifier 退出码 0，summary `PASS`，隔离数据库自动清理 |
| API release | PASS：候选 hermetic `verify-api-release.js` 独立确认 393 文件 |
| WinSW/ACL/dry-run | PASS：`validate-artifacts.ps1` 返回 `PASS`，无参数路径零副作用 |
| packaging 输入 | PASS：`server/package.json`、根 `package.json`、lockfile 均存在 |

## 唯一失败证据

命令（只使用 hermetic 副本，未触生产）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File `
  .temp/candidates/v043-bigplayer-api-cutover-20260921-0025/scripts/windows-services/prepare-services.ps1 `
  -Mode Preflight -TargetService PublicOpinionApi `
  -AppRoot .temp/hermetic-runs/v043-bigplayer-api-cutover-20260921-0025-copy `
  -WinSWSource .temp/WinSW-v038-source.exe -NodeExe (Get-Command node.exe).Source
```

结果：退出码 `1`。`build-api-release.ps1` 第 45 行 `Copy-Item` 报 `DirectoryNotFoundException`，找不到 hermetic 临时 stage：
`...v043-bigplayer-api-cutover-20260921-0025-copy\.temp\windows services preflight <id>\releases with spaces\.api-release-<id>`。

这直接阻断候选声明的“prepare-services hermetic Apply preflight PASS”，也阻断 API cutover 资格。该失败可在同一 hermetic 副本重复复现。

## 安全边界

- 未执行生产 API cutover、服务重启或 sync。
- 未修改候选、v038 或其他历史候选；未写生产库。
- v043 退回开发负责人；修复必须创建新的 CandidateId，不得原地修改或复用。
