param([string]$PackageName = ('community-selector-delivery-' + (Get-Date -Format 'yyyyMMdd-HHmmss')))
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$sourceRoot = Join-Path $repoRoot 'bigPlayer/admin/PublicOpinion'
$targetRoot = 'C:/ProgramData/PublicOpinion/frontend3001/releases/release-20260924123831-boardid-save/public/admin/PublicOpinion'
if ($PackageName -notmatch '^community-selector-delivery-[a-zA-Z0-9-]+$') { throw 'Invalid package name' }
$packageRoot = Join-Path $repoRoot ('.temp/' + $PackageName)
if (Test-Path -LiteralPath $packageRoot) { throw 'Package already exists; refusing overwrite' }
$files = @('assets/scope.js', 'index.html', 'content.html', 'alerts.html', 'sources.html', 'collection-runs.html', 'keywords.html')
$rows = foreach ($relative in $files) {
    $source = Join-Path $sourceRoot $relative
    $target = Join-Path $targetRoot $relative
    foreach ($file in @($source, $target)) {
        $item = Get-Item -LiteralPath $file
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse file rejected' }
    }
    [ordered]@{ path = $relative; candidateSha256 = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant(); beforeSha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() }
}
foreach ($relative in $files) {
    foreach ($kind in @('candidate', 'before')) {
        $destination = Join-Path $packageRoot ($kind + '/' + $relative)
        New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
        $origin = if ($kind -eq 'candidate') { Join-Path $sourceRoot $relative } else { Join-Path $targetRoot $relative }
        Copy-Item -LiteralPath $origin -Destination $destination
    }
}
[ordered]@{ status = 'PREPARED_NOT_APPLIED'; createdAt = (Get-Date).ToUniversalTime().ToString('o'); targetRoot = $targetRoot; files = @($rows); scope = '7 static files only; no service restart, API, Worker or DB change' } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $packageRoot 'delivery.json') -Encoding utf8
@'
# 六社区正式静态交付

状态：仅准备，未部署。candidate/ 是已 QA 的 7 文件；before/ 是当前正式 7 文件备份。

实施仅限 delivery.json 的 targetRoot 和 7 个相对路径。先确认正式文件仍与 before 一致；如已变化，停止并重新收取该变更，不能覆盖。
先 assets/scope.js，再串行替换 6 HTML。每次将候选复制到目标同目录的唯一 staging 文件，验证后用同卷 rename/replace 替换；禁止直接截断正在读取的正式文件。替换失败立即停止，恢复已替换文件。
回退按相同方法使用 before/ 的对应文件恢复；不改 API、Worker、DB 或服务 XML，不重启服务。
保留原 release manifest，在本包 delivery.json 旁记录实施/回退结果；不静默重写原 release manifest。
独立 QA 只核正式入口六社区选择与地区切换正确、页面接口能读取。已通过候选不重复测试，无需再次审计完整矩阵。
'@ | Set-Content -LiteralPath (Join-Path $packageRoot 'README.md') -Encoding utf8
[ordered]@{ status = 'PREPARED_NOT_APPLIED'; packageRoot = $packageRoot; candidateFiles = $files.Count; backupFiles = $files.Count } | ConvertTo-Json
