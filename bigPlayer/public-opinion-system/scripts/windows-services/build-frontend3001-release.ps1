param(
    [Parameter(Mandatory)][string]$SourceRoot,
    [Parameter(Mandatory)][string]$RuntimeRoot
)
$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath $SourceRoot).Path
$bigPlayerRoot = (Resolve-Path -LiteralPath (Join-Path $source '..')).Path
$runtime = [System.IO.Path]::GetFullPath($RuntimeRoot)
$parent = [System.IO.Path]::GetFullPath((Split-Path -Parent $runtime))
if (Test-Path -LiteralPath $runtime) { throw "RuntimeRoot already exists; refusing to overwrite: $runtime" }
$stage = Join-Path $parent ('.frontend3001-stage-' + [guid]::NewGuid().ToString('N'))

function Assert-NoReparseTree([string]$Path) {
    $items = @((Get-Item -LiteralPath $Path -Force)) + @(Get-ChildItem -LiteralPath $Path -Recurse -Force)
    foreach ($item in $items) {
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Source reparse point is forbidden: $($item.FullName)" }
    }
}
function Copy-Tree([string]$From, [string]$To) {
    New-Item -ItemType Directory -Path $To -Force | Out-Null
    & node.exe -e "require('node:fs').cpSync(process.argv[1],process.argv[2],{recursive:true,force:true})" $From $To
    if ($LASTEXITCODE -ne 0) { throw "Source tree copy failed with exit code $LASTEXITCODE" }
}

$adminSource = Join-Path $bigPlayerRoot 'admin\PublicOpinion'
$sharedSource = Join-Path $bigPlayerRoot 'shared'
$riskSource = Join-Path $source 'shared\riskModes.js'
$serverSource = Join-Path $PSScriptRoot 'frontend3001-server.js'
foreach ($required in @($adminSource, $sharedSource, $riskSource, $serverSource)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Required frontend3001 source missing: $required" }
}
Assert-NoReparseTree $adminSource
Assert-NoReparseTree $sharedSource
try {
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    & node.exe -e "require('node:fs').copyFileSync(process.argv[1],process.argv[2])" $serverSource (Join-Path $stage 'frontend3001-server.js')
    if ($LASTEXITCODE -ne 0) { throw 'Frontend server copy failed' }
    Copy-Tree $adminSource (Join-Path $stage 'public\admin\PublicOpinion')
    Copy-Tree $sharedSource (Join-Path $stage 'public\shared')
    New-Item -ItemType Directory -Path (Join-Path $stage 'public\public-opinion-system\shared') -Force | Out-Null
    & node.exe -e "require('node:fs').copyFileSync(process.argv[1],process.argv[2])" $riskSource (Join-Path $stage 'public\public-opinion-system\shared\riskModes.js')
    if ($LASTEXITCODE -ne 0) { throw 'Risk mode copy failed' }
    & node.exe (Join-Path $PSScriptRoot 'verify-frontend3001-release.js') $stage --write-manifest
    if ($LASTEXITCODE -ne 0) { throw "Frontend3001 release verification failed with exit code $LASTEXITCODE" }
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    Move-Item -LiteralPath $stage -Destination $runtime
    Write-Output "PASS: frontend3001 release built at $runtime"
} finally {
    if (Test-Path -LiteralPath $stage) {
        $resolvedStage = (Resolve-Path -LiteralPath $stage).Path
        if (-not $resolvedStage.StartsWith(($parent.TrimEnd('\') + '\'), [System.StringComparison]::OrdinalIgnoreCase)) { throw "Refusing stage cleanup outside runtime parent: $resolvedStage" }
        & node.exe -e "require('node:fs').rmSync(process.argv[1],{recursive:true,force:true,maxRetries:3})" $resolvedStage
        if ($LASTEXITCODE -ne 0) { throw "Stage cleanup failed with exit code $LASTEXITCODE" }
    }
}
