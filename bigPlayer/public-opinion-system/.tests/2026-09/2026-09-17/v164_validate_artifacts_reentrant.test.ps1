$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$validator = Join-Path $projectRoot 'scripts\windows-services\validate-artifacts.ps1'
$tempRoot = Join-Path $projectRoot '.temp'
$before = @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter 'winsw-render-validation-*' -ErrorAction SilentlyContinue).Name

& $validator
& $validator

$after = @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter 'winsw-render-validation-*' -ErrorAction SilentlyContinue).Name
$newProbe = @($after | Where-Object { $_ -notin $before })
if ($newProbe.Count -ne 0) {
    throw "Render probe cleanup failed: $($newProbe -join ', ')"
}

Write-Output 'PASS: validate-artifacts.ps1 ran twice in one PowerShell session and cleaned both render probes'
