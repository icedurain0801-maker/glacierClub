param([Parameter(Mandatory)][string]$SourceRoot,[Parameter(Mandatory)][string]$RuntimeRoot)
$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath $SourceRoot).Path
$runtime = [System.IO.Path]::GetFullPath($RuntimeRoot)
$parent = Split-Path -Parent $runtime
$stage = Join-Path $parent ('.worker-release-' + [guid]::NewGuid().ToString('N'))
try {
    foreach ($required in @('package.json','package-lock.json','worker\package.json','worker\src','scripts\q1_crawler.py')) {
        $candidate = Join-Path $source $required
        if (-not (Test-Path -LiteralPath $candidate)) { throw "Required Worker release source missing: $candidate" }
        if (((Get-Item -LiteralPath $candidate -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Source reparse point is forbidden: $candidate" }
    }
    New-Item -ItemType Directory -Path (Join-Path $stage 'worker') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $source 'package.json'),(Join-Path $source 'package-lock.json') -Destination $stage
    Copy-Item -LiteralPath (Join-Path $source 'worker\package.json') -Destination (Join-Path $stage 'worker')
    & npm.cmd ci --omit=dev --ignore-scripts --workspace worker --prefix $stage
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }
    & node.exe -e "const fs=require('node:fs');for(const n of ['public-opinion-system-worker','public-opinion-system-server'])fs.rmSync(require('node:path').join(process.argv[1],n),{recursive:true,force:true})" (Join-Path $stage 'node_modules')
    if ($LASTEXITCODE -ne 0) { throw 'Workspace link cleanup failed' }
    & node.exe (Join-Path $PSScriptRoot 'copy-worker-runtime.js') $source $stage
    if ($LASTEXITCODE -ne 0) { throw 'Worker closure copy failed' }
    Remove-Item -LiteralPath (Join-Path $stage 'worker\package.json') -Force
    & node.exe (Join-Path $PSScriptRoot 'verify-worker-release.js') $stage $source --write-manifest
    if ($LASTEXITCODE -ne 0) { throw 'Worker release verification failed' }
    if (Test-Path -LiteralPath $runtime) { throw "RuntimeRoot already exists: $runtime" }
    Move-Item -LiteralPath $stage -Destination $runtime
    Write-Output "PASS: Worker release built at $runtime"
} finally {
    if (Test-Path -LiteralPath $stage) {
        $resolved = (Resolve-Path -LiteralPath $stage).Path; $safeParent = [System.IO.Path]::GetFullPath($parent).TrimEnd('\')
        if (-not $resolved.StartsWith("$safeParent\",[System.StringComparison]::OrdinalIgnoreCase)) { throw "Refusing cleanup outside release parent: $resolved" }
        & node.exe -e "require('node:fs').rmSync(process.argv[1],{recursive:true,force:true,maxRetries:3})" $resolved
    }
}
