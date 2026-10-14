$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$temp = (Resolve-Path -LiteralPath (Join-Path $root '.temp')).Path.TrimEnd('\')
$fixture = Join-Path $temp ('v193 f3001 ' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$manager = Join-Path $root 'scripts\windows-services\manage-frontend3001.ps1'
$builder = Join-Path $root 'scripts\windows-services\build-frontend3001-release.ps1'
$verifier = Join-Path $root 'scripts\windows-services\verify-frontend3001-release.js'
$validWinSW = Join-Path $root '.temp\windows-services-stage-b1\winsw-v2.12.0\WinSW-x64.exe'
$nodeExe = (Get-Command node.exe).Source
$productionRoot = 'C:\ProgramData\PublicOpinion\frontend3001'

function Get-ProtectedState {
    [pscustomobject]@{
        Production = if (Test-Path -LiteralPath $productionRoot) { @(Get-ChildItem -LiteralPath $productionRoot -Recurse -Force -ErrorAction SilentlyContinue | Sort-Object FullName | ForEach-Object { "$($_.FullName)|$($_.Length)|$($_.LastWriteTimeUtc.Ticks)" }) -join "`n" } else { '<absent>' }
        Listeners = @(Get-NetTCPConnection -State Listen -LocalPort 3001,4320 -ErrorAction SilentlyContinue | Sort-Object LocalPort,OwningProcess | ForEach-Object { "$($_.LocalPort):$($_.OwningProcess)" }) -join "`n"
        Services = @(Get-Service -Name PublicOpinionFrontend3001,PublicOpinionApi,PublicOpinionWorker -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object { "$($_.Name):$($_.Status):$($_.StartType)" }) -join "`n"
        Tasks = @(Get-ScheduledTask -TaskName 'BigPlayer Last Night Overseas Daily 02','BigPlayer Q1 Daily 02','BigPlayer Keep Server Alive' -ErrorAction SilentlyContinue | Sort-Object TaskName | ForEach-Object { "$($_.TaskName):$($_.State)" }) -join "`n"
    }
}
function Assert-StateEqual($Before, $After, [string]$Context) {
    foreach ($name in @('Production','Listeners','Services','Tasks')) {
        if ($Before.$name -ne $After.$name) { throw "$Context changed protected state: $name" }
    }
}
function Invoke-Rejected([scriptblock]$Command, [string]$Pattern) {
    $failed = $false
    try { & $Command *> $null } catch { if ($_.Exception.Message -notmatch $Pattern) { throw }; $failed = $true }
    if (-not $failed -and $LASTEXITCODE -eq 0) { throw "Expected rejection matching: $Pattern" }
}
function Remove-Fixture {
    if (-not (Test-Path -LiteralPath $fixture)) { return }
    $resolved = (Resolve-Path -LiteralPath $fixture).Path
    if (-not $resolved.StartsWith(($temp + '\'), [System.StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe fixture cleanup: $resolved" }
    & node.exe -e "require('node:fs').rmSync(process.argv[1],{recursive:true,force:true,maxRetries:3})" $resolved
    if ($LASTEXITCODE -ne 0) { throw 'Fixture cleanup failed' }
}

$before = Get-ProtectedState
$beforePreflight = @(Get-ChildItem -LiteralPath $temp -Directory -Filter 'f3001 pre *' -ErrorAction SilentlyContinue).Name
try {
    $dryRun = @(& $manager -Mode DryRun)
    if (($dryRun -join "`n") -notmatch 'No file, ACL, service, task, listener, process') { throw 'DryRun zero-effect marker missing' }
    Assert-StateEqual $before (Get-ProtectedState) 'DryRun'

    Invoke-Rejected { & $manager -Mode Apply } 'Apply requires -ConfirmApply'
    Assert-StateEqual $before (Get-ProtectedState) 'Apply gate rejection'

    $wrongWinSW = Join-Path $env:SystemRoot 'System32\where.exe'
    Invoke-Rejected { & $manager -Mode Preflight -WinSWSource $wrongWinSW -NodeExe $nodeExe } 'WinSW SHA-256 mismatch'
    Assert-StateEqual $before (Get-ProtectedState) 'Wrong WinSW rejection'

    if (-not (Test-Path -LiteralPath $validWinSW -PathType Leaf)) { throw "Validated WinSW fixture missing: $validWinSW" }
    $preflight = @(& $manager -Mode Preflight -WinSWSource $validWinSW -NodeExe $nodeExe)
    if (($preflight -join "`n") -notmatch 'PASS: frontend3001 isolated preflight') { throw 'Preflight success marker missing' }
    Assert-StateEqual $before (Get-ProtectedState) 'Preflight'

    New-Item -ItemType Directory -Path $fixture -Force | Out-Null
    $release = Join-Path $fixture 'release'
    & $builder -SourceRoot $root -RuntimeRoot $release
    & node.exe $verifier $release
    if ($LASTEXITCODE -ne 0) { throw 'Release verification failed' }
    foreach ($required in @('frontend3001-server.js','frontend3001-release-manifest.json','public\admin\PublicOpinion\sources.html','public\shared\sidebar.js','public\public-opinion-system\shared\riskModes.js')) {
        if (-not (Test-Path -LiteralPath (Join-Path $release $required) -PathType Leaf)) { throw "Release entry missing: $required" }
    }
    Add-Content -LiteralPath (Join-Path $release 'frontend3001-server.js') -Value '// tamper'
    $oldPreference = $ErrorActionPreference
    try { $ErrorActionPreference = 'Continue'; & node.exe $verifier $release *> $null; $tamperCode = $LASTEXITCODE }
    finally { $ErrorActionPreference = $oldPreference }
    if ($tamperCode -eq 0) { throw 'Tampered release unexpectedly passed' }

    $managerText = Get-Content -LiteralPath $manager -Raw
    if ($managerText -notmatch "ValidateSet\('DryRun', 'Preflight', 'Apply'\)" -or $managerText -notmatch 'INSTALL-AND-START-PUBLIC-OPINION-FRONTEND-3001') { throw 'Mode/apply gate contract missing' }
    if ($managerText -notmatch '\$wrapperCreated' -or $managerText -notmatch '\$xmlCreated' -or $managerText -notmatch 'SCM rollback is incomplete; preserving artifacts') { throw 'Apply ownership-aware rollback contract missing' }
    if ($managerText -match '(?i)(PublicOpinionApi|PublicOpinionWorker).*(?:stop|uninstall)' -or $managerText -match '(?i)(?:stop|uninstall).*?(PublicOpinionApi|PublicOpinionWorker)') { throw 'Frontend3001 script may control API/Worker' }
    $xml = Get-Content -LiteralPath (Join-Path $root 'scripts\windows-services\PublicOpinionFrontend3001.xml') -Raw
    foreach ($contract in @('NT AUTHORITY','LocalService','Automatic','delayedAutoStart','restart','%CONFIG_FILE%','%LOG_ROOT%')) { if ($xml -notmatch [regex]::Escape($contract)) { throw "WinSW contract missing: $contract" } }
} finally { Remove-Fixture }

$afterPreflight = @(Get-ChildItem -LiteralPath $temp -Directory -Filter 'f3001 pre *' -ErrorAction SilentlyContinue).Name
if (@($afterPreflight | Where-Object { $_ -notin $beforePreflight }).Count -ne 0) { throw 'Preflight residue remains' }
Assert-StateEqual $before (Get-ProtectedState) 'Completed v193 regression'
Write-Output 'PASS: frontend3001 dry-run/preflight/apply gates, immutable release, ACL preparation, tamper rejection, and protected-state invariance validated'
