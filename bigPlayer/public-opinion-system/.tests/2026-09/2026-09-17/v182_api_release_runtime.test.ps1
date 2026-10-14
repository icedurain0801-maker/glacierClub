$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$tempRoot = (Resolve-Path -LiteralPath (Join-Path $projectRoot '.temp')).Path.TrimEnd('\')
$fixtureRoot = Join-Path $tempRoot ('v182 api release ' + [guid]::NewGuid().ToString('N'))
$releaseRoot = Join-Path $fixtureRoot 'release with spaces'
$builder = Join-Path $projectRoot 'scripts\windows-services\build-api-release.ps1'
$verifier = Join-Path $projectRoot 'scripts\windows-services\verify-api-release.js'
$failures = [System.Collections.Generic.List[string]]::new()

function Get-ProtectedState {
    $programDataRoot = 'C:\ProgramData\PublicOpinion'
    [pscustomobject]@{
        ProgramData = if (Test-Path -LiteralPath $programDataRoot) { @(Get-ChildItem -LiteralPath $programDataRoot -Recurse -Force -ErrorAction SilentlyContinue | Sort-Object FullName | ForEach-Object { "$($_.FullName)|$($_.Length)|$($_.LastWriteTimeUtc.Ticks)" }) -join "`n" } else { '<absent>' }
        Listeners = @(Get-NetTCPConnection -State Listen -LocalPort 3306, 4320, 3001 -ErrorAction SilentlyContinue | Sort-Object LocalPort, LocalAddress | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort):$($_.OwningProcess)" }) -join "`n"
        Services = @(Get-Service -Name PublicOpinionApi, PublicOpinionWorker -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object { "$($_.Name):$($_.Status):$($_.StartType)" }) -join "`n"
        Tasks = @(Get-ScheduledTask -TaskName 'BigPlayer Last Night Overseas Daily 02', 'BigPlayer Q1 Daily 02', 'BigPlayer Keep Server Alive' -ErrorAction SilentlyContinue | Sort-Object TaskName | ForEach-Object { "$($_.TaskName):$($_.State)" }) -join "`n"
    }
}

function Invoke-Native([scriptblock]$Command) {
    $before = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        try { & $Command *> $null; return $LASTEXITCODE }
        catch { return 1 }
    }
    finally { $ErrorActionPreference = $before }
}
function Assert-Rejected([string]$Name, [scriptblock]$Command) {
    $exitCode = Invoke-Native $Command
    if ($exitCode -eq 0) { $failures.Add("$Name unexpectedly passed") }
}
function Remove-Fixture([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $resolved = (Resolve-Path -LiteralPath $Path).Path
    if (-not $resolved.StartsWith("$tempRoot\", [System.StringComparison]::OrdinalIgnoreCase)) { throw "Refusing cleanup outside project .temp: $resolved" }
    node.exe -e "require('node:fs').rmSync(process.argv[1], {recursive:true, force:true, maxRetries:3})" $resolved
    if ($LASTEXITCODE -ne 0) { throw 'fixture cleanup failed' }
}
function Restore-Release {
    Remove-Fixture $releaseRoot
    & $builder -SourceRoot $projectRoot -RuntimeRoot $releaseRoot
    if ($LASTEXITCODE -ne 0) { throw 'release build failed' }
}

$beforeState = Get-ProtectedState
$beforePreflight = @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter 'windows services preflight *' -ErrorAction SilentlyContinue).Name
try {
    New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
    Restore-Release
    & node.exe $verifier $releaseRoot $projectRoot
    if ($LASTEXITCODE -ne 0) { throw 'release verification failed' }
    foreach ($required in @('server\src\app.js', 'server\src\runtimeEnv.js', 'shared\riskModes.js', 'node_modules\mysql2\package.json', 'package-release-manifest.json')) {
        if (-not (Test-Path -LiteralPath (Join-Path $releaseRoot $required) -PathType Leaf)) { $failures.Add("required release file missing: $required") }
    }
    foreach ($forbidden in @('worker', 'server\test', 'node_modules\public-opinion-system-server')) {
        if (Test-Path -LiteralPath (Join-Path $releaseRoot $forbidden)) { $failures.Add("forbidden release entry present: $forbidden") }
    }

    Remove-Item -LiteralPath (Join-Path $releaseRoot 'server\src\app.js') -Force
    $rewriteExitCode = Invoke-Native { & node.exe $verifier $releaseRoot $projectRoot --write-manifest }
    if ($rewriteExitCode -eq 0) {
        Assert-Rejected 'missing required API entry with synchronized manifest' { & node.exe $verifier $releaseRoot $projectRoot }
    }

    Restore-Release
    Add-Content -LiteralPath (Join-Path $releaseRoot 'server\src\runtimeEnv.js') -Value '// tampered'
    Assert-Rejected 'wrong hash' { & node.exe $verifier $releaseRoot $projectRoot }

    Restore-Release
    $outside = Join-Path $fixtureRoot 'outside release'; New-Item -ItemType Directory -Path $outside -Force | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $outside 'probe.js'), 'module.exports = true')
    $releaseLink = Join-Path $releaseRoot 'server\src\linked-dir'
    cmd.exe /c "mklink /J `"$releaseLink`" `"$outside`"" *> $null
    if ($LASTEXITCODE -ne 0) { throw 'could not create release reparse fixture' }
    Assert-Rejected 'release reparse point' { & node.exe $verifier $releaseRoot $projectRoot --write-manifest }

    Restore-Release
    foreach ($leak in @($projectRoot, 'C:\Users\fixture\secret.env', 'C:\safe\AppData\secret.env')) {
        [System.IO.File]::WriteAllText((Join-Path $releaseRoot 'server\src\leak-probe.js'), "// $leak`nmodule.exports = true;")
        Assert-Rejected "path leakage: $leak" { & node.exe $verifier $releaseRoot $projectRoot --write-manifest }
    }

    $sourceFixture = Join-Path $fixtureRoot 'source fixture'; New-Item -ItemType Directory -Path (Join-Path $sourceFixture 'server') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $projectRoot 'package.json'), (Join-Path $projectRoot 'package-lock.json') -Destination $sourceFixture
    Copy-Item -LiteralPath (Join-Path $projectRoot 'server\package.json') -Destination (Join-Path $sourceFixture 'server')
    cmd.exe /c "mklink /J `"$(Join-Path $sourceFixture 'server\src')`" `"$(Join-Path $projectRoot 'server\src')`"" *> $null
    if ($LASTEXITCODE -ne 0) { throw 'could not create SourceRoot reparse fixture' }
    New-Item -ItemType Directory -Path (Join-Path $sourceFixture 'shared') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $projectRoot 'shared\riskModes.js') -Destination (Join-Path $sourceFixture 'shared\riskModes.js')
    Assert-Rejected 'SourceRoot allowlist reparse point' { & $builder -SourceRoot $sourceFixture -RuntimeRoot (Join-Path $fixtureRoot 'source-reparse-release') }

    $runtimeEnv = Join-Path $projectRoot 'server\src\runtimeEnv.js'
    Assert-Rejected 'service configuration missing' { & node.exe -e "process.env.PUBLIC_OPINION_SERVICE_MODE='1'; delete process.env.PUBLIC_OPINION_ENV_FILE; require(process.argv[1]).loadRuntimeEnv()" $runtimeEnv }
    Assert-Rejected 'service configuration file absent' { & node.exe -e "process.env.PUBLIC_OPINION_SERVICE_MODE='1'; process.env.PUBLIC_OPINION_ENV_FILE=process.argv[2]; require(process.argv[1]).loadRuntimeEnv()" $runtimeEnv (Join-Path $fixtureRoot 'missing.env') }
    $envTarget = Join-Path $fixtureRoot 'real.env'; $envLink = Join-Path $fixtureRoot 'linked.env'
    [System.IO.File]::WriteAllText($envTarget, 'V182_CONFIG_FIXTURE=1')
    cmd.exe /c "mklink `"$envLink`" `"$envTarget`"" *> $null
    if ($LASTEXITCODE -ne 0) { throw 'could not create config reparse fixture' }
    Assert-Rejected 'service configuration reparse point' { & node.exe -e "process.env.PUBLIC_OPINION_SERVICE_MODE='1'; process.env.PUBLIC_OPINION_ENV_FILE=process.argv[2]; require(process.argv[1]).loadRuntimeEnv()" $runtimeEnv $envLink }
} finally { Remove-Fixture $fixtureRoot }

$afterState = Get-ProtectedState
foreach ($name in @('ProgramData', 'Listeners', 'Services', 'Tasks')) { if ($beforeState.$name -ne $afterState.$name) { $failures.Add("protected state changed: $name") } }
$afterPreflight = @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter 'windows services preflight *' -ErrorAction SilentlyContinue).Name
if (@($afterPreflight | Where-Object { $_ -notin $beforePreflight }).Count -ne 0) { $failures.Add('preflight probe residue remains') }
if (Test-Path -LiteralPath $fixtureRoot) { $failures.Add('v182 fixture residue remains') }
if ($failures.Count -ne 0) { throw ($failures -join '; ') }
Write-Output 'PASS: API release trust boundary, config fail-closed behavior, protected state, and cleanup validated'
