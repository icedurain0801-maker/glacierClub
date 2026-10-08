# TapTap C 阶段候选准备命令

状态：隔离合同实现，待 QA；未写 `C:\ProgramData`、未控制服务、未运行真实预检。

新增唯一 C 入口 `scripts/windows-services/prepare-taptap-worker-candidate.ps1`。它复用既有 Worker 构建、XML 渲染、release 验签；仅允许干净的 TapTap 单提交 checkout，核验 baseline/candidate/patch 哈希、固定 WinSW 哈希及非 reparse 路径。

- 仅创建新的 release、candidate-staging、audit；不写 active `services`，不调用 stop/install/start/rollback；
- 失败保留本次 audit/staging/release 取证，绝不删除已有候选；
- 原子生成 `verified-snapshot.json`，并输出 B 阶段真实只读预检所需参数；
- 真实 `Prepare` 在任何 ProgramData 写入前，必须同时具备 `PUBLIC_OPINION_STAGE_C_B_AUTHORIZED=true`、匹配的 `PUBLIC_OPINION_STAGE_C_B_CONFIRM` 和显式 `-CAndBConfirm`；未授权一律 `C_B_UNAUTHORIZED`。隔离临时根可演练 `hash`、`xml`、`snapshot`、`path` 故障。

## 已冻结的 TapTap-only 候选输入

- 基线 commit：`924fe1c848a69865f18c8e9e1c3c6a41794a8bab`
- 独立候选 commit：`627c4e928845cc5bbae60556cb6ae68d6a5aff11`
- patch SHA-256：`4BCB47C89E32875D8F31E42708BDBCE4CC6B6094FFB8EA206D7E17C767077997`
- 忽略的构建 lock SHA-256：`4CF97A1F34D59657664A262108B3909E7811B2128B56034F558CA51EA14977AB`（仅从已验证候选工件复制，C 入口逐次复算）
- 唯一变更：`bigPlayer/public-opinion-system/worker/src/worker.js`（删除 TapTap incremental cursor 归零特判，改用保存的 checkpoint cursor）
- 干净 checkout：`C:\Users\Administrator\AppData\Roaming\Code\User\project manage\bigPlayer\public-opinion-system\.temp\taptap-stage-c-candidate-20260920`
- 固定 CandidateId：`worker-release-taptap-20260920-627c4e9`

在 C+B 限域弹窗授权后，唯一可执行的 C 命令为：

```powershell
$env:PUBLIC_OPINION_STAGE_C_B_AUTHORIZED = 'true'
$env:PUBLIC_OPINION_STAGE_C_B_CONFIRM = '<single-use-confirmation>'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows-services/prepare-taptap-worker-candidate.ps1 `
  -Mode Prepare -CAndBConfirm '<single-use-confirmation>' `
  -CandidateId 'worker-release-taptap-20260920-627c4e9' `
  -SourceRoot 'C:\Users\Administrator\AppData\Roaming\Code\User\project manage\bigPlayer\public-opinion-system\.temp\taptap-stage-c-candidate-20260920\bigPlayer\public-opinion-system' `
  -WinSWSource 'C:\ProgramData\PublicOpinion\config\backups\siteurls-api-release-20260918-rollback\PublicOpinionApi.exe' `
  -NodeExe '<approved-node.exe>' -ConfigFile 'C:\ProgramData\PublicOpinion\config\public-opinion.env' `
  -ExpectedBaselineCommit '924fe1c848a69865f18c8e9e1c3c6a41794a8bab' `
  -ExpectedCandidateCommit '627c4e928845cc5bbae60556cb6ae68d6a5aff11' `
  -ExpectedTapTapPatchSha256 '4BCB47C89E32875D8F31E42708BDBCE4CC6B6094FFB8EA206D7E17C767077997' `
  -ExpectedPackageLockSha256 '4CF97A1F34D59657664A262108B3909E7811B2128B56034F558CA51EA14977AB' `
  -PackageLockSource 'C:\Users\Administrator\AppData\Roaming\Code\User\project manage\bigPlayer\public-opinion-system\.temp\taptap-cursor-release-candidate-20260920\candidate-worker-release\package-lock.json'
```

其唯一写入目标是 `C:\ProgramData\PublicOpinion\releases\worker-release-taptap-20260920-627c4e9`、相同 ID 的 `candidate-staging` 和 `audit` 目录。C 失败时保留上述新目录中的 `failure.json`、staging/release 供取证；不删除任何既有 release，不切换/重启 Worker，也不触碰 API/3001。之后的 B 只读预检使用命令输出的 `preflight` 参数；D 仍需另一次切换授权。
