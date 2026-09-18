$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$tempRoot = Join-Path $projectRoot '.temp'
$fixtureRoot = Join-Path $tempRoot ("preflight regression {0}" -f [guid]::NewGuid().ToString('N'))
$hostDirectory = Join-Path $fixtureRoot 'PowerShell Host With Spaces'
$powershellWrapper = Join-Path $hostDirectory 'powershell wrapper.cmd'
$badWinSW = Join-Path $fixtureRoot 'wrong winsw.exe'
$validWinSW = Join-Path $projectRoot '.temp\windows-services-stage-b1\winsw-v2.12.0\WinSW-x64.exe'
$installScript = Join-Path $projectRoot 'scripts\windows-services\install-services.cmd'
$productionServiceRoot = 'C:\ProgramData\PublicOpinion\services'
$preflightPattern = 'windows services preflight *'
$previousPowerShellExe = $env:POWERSHELL_EXE
$previousWinSWExe = $env:WIN_SW_EXE
$previousServiceRoot = $env:SERVICE_ROOT
$previousServiceLogRoot = $env:SERVICE_LOG_ROOT

function Get-ProtectedState {
    $serviceFiles = @()
    if (Test-Path -LiteralPath $productionServiceRoot) {
        $serviceFiles = @(Get-ChildItem -LiteralPath $productionServiceRoot -File -Recurse -Force | Sort-Object FullName | ForEach-Object {
            "$($_.FullName)|$($_.Length)|$($_.LastWriteTimeUtc.Ticks)"
        })
    }
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 3306, 4320, 3001 -ErrorAction SilentlyContinue |
        Sort-Object LocalPort, LocalAddress |
        ForEach-Object { "$($_.LocalAddress):$($_.LocalPort):$($_.OwningProcess)" })
    $services = @(Get-Service -Name PublicOpinionApi, PublicOpinionWorker -ErrorAction SilentlyContinue |
        Sort-Object Name | ForEach-Object { "$($_.Name):$($_.Status):$($_.StartType)" })
    $tasks = @(Get-ScheduledTask -TaskName 'BigPlayer Last Night Overseas Daily 02', 'BigPlayer Q1 Daily 02', 'BigPlayer Keep Server Alive' |
        Sort-Object TaskName | ForEach-Object { "$($_.TaskName):$($_.State)" })
    return [pscustomobject]@{
        ServiceFiles = $serviceFiles -join "`n"
        Listeners = $listeners -join "`n"
        Services = $services -join "`n"
        Tasks = $tasks -join "`n"
    }
}

function Assert-StateEqual($Before, $After, [string]$Context) {
    foreach ($name in @('ServiceFiles', 'Listeners', 'Services', 'Tasks')) {
        if ($Before.$name -ne $After.$name) { throw "$Context changed protected state: $name" }
    }
}

function Assert-NoNewPreflightDirectory([string[]]$Before) {
    $after = @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter $preflightPattern -ErrorAction SilentlyContinue).Name
    $newDirectories = @($after | Where-Object { $_ -notin $Before })
    if ($newDirectories.Count -ne 0) { throw "Preflight directory cleanup failed: $($newDirectories -join ', ')" }
}

$beforeState = Get-ProtectedState
$beforePreflight = @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter $preflightPattern -ErrorAction SilentlyContinue).Name
try {
    New-Item -ItemType Directory -Path $hostDirectory -Force | Out-Null
    [System.IO.File]::WriteAllText(
        $powershellWrapper,
        "@echo off`r`n`"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`" %*`r`n",
        [System.Text.Encoding]::ASCII
    )
    Copy-Item -LiteralPath (Join-Path $env:SystemRoot 'System32\where.exe') -Destination $badWinSW

    $env:POWERSHELL_EXE = $powershellWrapper
    $env:WIN_SW_EXE = $validWinSW
    $env:SERVICE_ROOT = Join-Path $fixtureRoot 'environment bypass services'
    $env:SERVICE_LOG_ROOT = Join-Path $fixtureRoot 'environment bypass logs'
    $positiveOutput = @(& $installScript /preflight PublicOpinionApi 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "API-only preflight failed: $($positiveOutput -join ' | ')" }
    if (($positiveOutput -join "`n") -notmatch 'PASS: isolated preflight completed for PublicOpinionApi') {
        throw 'API-only preflight success marker missing'
    }
    if ((Test-Path -LiteralPath $env:SERVICE_ROOT) -or (Test-Path -LiteralPath $env:SERVICE_LOG_ROOT)) {
        throw 'Preflight honored an environment root override'
    }
    Assert-NoNewPreflightDirectory $beforePreflight
    Assert-StateEqual $beforeState (Get-ProtectedState) 'Successful preflight'

    $env:WIN_SW_EXE = $badWinSW
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $negativeOutput = @(& $installScript /preflight PublicOpinionApi 2>&1)
        $negativeExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($negativeExitCode -eq 0) { throw 'Wrong WinSW hash unexpectedly passed preflight' }
    if (($negativeOutput -join "`n") -notmatch 'WinSW SHA-256 mismatch') { throw 'Wrong hash failure marker missing' }
    Assert-NoNewPreflightDirectory $beforePreflight
    Assert-StateEqual $beforeState (Get-ProtectedState) 'Wrong-hash preflight'

    & (Join-Path $PSScriptRoot 'v173_winsw_service_account_contract.test.ps1')
    & (Join-Path $PSScriptRoot 'v169_validate_artifacts_deployment_acl.test.ps1')
    Assert-NoNewPreflightDirectory $beforePreflight
    Assert-StateEqual $beforeState (Get-ProtectedState) 'Negative account and ACL validation'
} finally {
    $env:POWERSHELL_EXE = $previousPowerShellExe
    $env:WIN_SW_EXE = $previousWinSWExe
    $env:SERVICE_ROOT = $previousServiceRoot
    $env:SERVICE_LOG_ROOT = $previousServiceLogRoot
    if ([System.IO.Directory]::Exists($fixtureRoot)) {
        $resolvedFixture = (Resolve-Path -LiteralPath $fixtureRoot).Path
        $resolvedTempRoot = (Resolve-Path -LiteralPath $tempRoot).Path.TrimEnd('\')
        if (-not $resolvedFixture.StartsWith("$resolvedTempRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing fixture cleanup outside project .temp: $resolvedFixture"
        }
        [System.IO.Directory]::Delete($resolvedFixture, $true)
    }
}

Assert-NoNewPreflightDirectory $beforePreflight
Assert-StateEqual $beforeState (Get-ProtectedState) 'Completed regression'
if (Test-Path -LiteralPath $fixtureRoot) { throw "Fixture cleanup failed: $fixtureRoot" }

Write-Output 'PASS: preflight shares the apply preparation path, supports a spaced PowerShell host path, fails closed, and leaves protected state unchanged'
