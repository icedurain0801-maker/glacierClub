param(
    [Parameter(Mandatory)][string]$SourceRoot,
    [Parameter(Mandatory)][string]$RuntimeRoot
)

$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath $SourceRoot).Path
$runtime = [System.IO.Path]::GetFullPath($RuntimeRoot)
$runtimeParent = Split-Path -Parent $runtime
$stage = Join-Path $runtimeParent ('.api-release-' + [guid]::NewGuid().ToString('N'))

function Test-Inside([string]$Root, [string]$Candidate) {
    $rootPath = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')
    $candidatePath = [System.IO.Path]::GetFullPath($Candidate).TrimEnd('\')
    return $candidatePath -eq $rootPath -or $candidatePath.StartsWith("$rootPath\", [System.StringComparison]::OrdinalIgnoreCase)
}

function Assert-NoReparseTree([string]$Path) {
    $rootItem = Get-Item -LiteralPath $Path -Force
    foreach ($item in @($rootItem) + @(Get-ChildItem -LiteralPath $Path -Force -Recurse)) {
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Source reparse point is forbidden: $($item.FullName)"
        }
    }
}

$sourceServer = Join-Path $source 'server\src'
$sourceShared = Join-Path $source 'shared\riskModes.js'
foreach ($copySource in @($sourceServer, $sourceShared, (Join-Path $source 'package.json'), (Join-Path $source 'package-lock.json'), (Join-Path $source 'server\package.json'))) {
    if (-not (Test-Path -LiteralPath $copySource)) { throw "Required API release source missing: $copySource" }
    $item = Get-Item -LiteralPath $copySource -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Source reparse point is forbidden: $copySource" }
}
Assert-NoReparseTree $sourceServer
if (Test-Inside $sourceServer $runtime) { throw 'RuntimeRoot must not be inside server/src' }

function Copy-Tree([string]$From, [string]$To) {
    New-Item -ItemType Directory -Path $To -Force | Out-Null
    & node.exe -e "require('node:fs').cpSync(process.argv[1], process.argv[2], { recursive: true, force: true })" $From $To
    if ($LASTEXITCODE -ne 0) { throw "Source tree copy failed with exit code $LASTEXITCODE" }
}

try {
    New-Item -ItemType Directory -Path (Join-Path $stage 'server') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $source 'package.json') -Destination $stage
    Copy-Item -LiteralPath (Join-Path $source 'package-lock.json') -Destination $stage
    Copy-Item -LiteralPath (Join-Path $source 'server\package.json') -Destination (Join-Path $stage 'server')

    & npm.cmd ci --omit=dev --ignore-scripts --workspace server --prefix $stage
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }

    $workspaceLink = Join-Path $stage 'node_modules\public-opinion-system-server'
    & node.exe -e "const fs=require('node:fs');try{fs.lstatSync(process.argv[1]);fs.rmSync(process.argv[1],{recursive:true,force:true})}catch(error){if(error.code!=='ENOENT')throw error}" $workspaceLink
    if ($LASTEXITCODE -ne 0) { throw "Workspace link cleanup failed with exit code $LASTEXITCODE" }
    Copy-Tree (Join-Path $source 'server\src') (Join-Path $stage 'server\src')
    New-Item -ItemType Directory -Path (Join-Path $stage 'shared') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $source 'shared\riskModes.js') -Destination (Join-Path $stage 'shared\riskModes.js')
    Remove-Item -LiteralPath (Join-Path $stage 'server\package.json') -Force

    & node.exe (Join-Path $PSScriptRoot 'verify-api-release.js') $stage $source --write-manifest
    if ($LASTEXITCODE -ne 0) { throw "API release verification failed with exit code $LASTEXITCODE" }

    if (Test-Path -LiteralPath $runtime) {
        throw "RuntimeRoot already exists; refusing to overwrite: $runtime"
    }
    Move-Item -LiteralPath $stage -Destination $runtime
    Write-Output "PASS: API release built at $runtime"
} finally {
    if (Test-Path -LiteralPath $stage) {
        $resolvedStage = (Resolve-Path -LiteralPath $stage).Path
        $resolvedParent = [System.IO.Path]::GetFullPath($runtimeParent).TrimEnd('\')
        if (-not $resolvedStage.StartsWith("$resolvedParent\", [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing release cleanup outside runtime parent: $resolvedStage"
        }
        & node.exe -e "require('node:fs').rmSync(process.argv[1], { recursive: true, force: true, maxRetries: 3 })" $resolvedStage
        if ($LASTEXITCODE -ne 0) { throw "Release staging cleanup failed with exit code $LASTEXITCODE" }
    }
}
