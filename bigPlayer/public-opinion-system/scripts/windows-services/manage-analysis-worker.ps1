param(
    [ValidateSet('DryRun','Preflight','Apply')][string]$Mode = 'DryRun',
    [string]$ServiceRoot = 'C:\ProgramData\PublicOpinion\services',
    [string]$LogRoot = 'C:\ProgramData\PublicOpinion\logs'
)
$ErrorActionPreference = 'Stop'
$name = 'PublicOpinionAnalysisWorker'
$workerXmlPath = Join-Path $ServiceRoot 'PublicOpinionWorker.xml'
$workerExe = Join-Path $ServiceRoot 'PublicOpinionWorker.exe'
$analysisXmlPath = Join-Path $ServiceRoot "$name.xml"
$analysisExe = Join-Path $ServiceRoot "$name.exe"

if ($Mode -eq 'DryRun') {
    Write-Output '[dry-run] Validate the active Worker release/env and install or start only PublicOpinionAnalysisWorker when requested.'
    exit 0
}

foreach ($file in @($workerXmlPath, $workerExe)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Active Worker artifact missing: $file" }
    if (((Get-Item -LiteralPath $file -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Reparse point is forbidden: $file" }
}
[xml]$worker = Get-Content -Raw -LiteralPath $workerXmlPath
if ([string]$worker.service.id -ne 'PublicOpinionWorker') { throw 'Active Worker service ID mismatch' }
$workerEntry = [string]$worker.service.arguments
$release = [IO.Path]::GetFullPath((Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $workerEntry.Trim('"')))))
$expectedWorkerEntry = Join-Path $release 'worker\src\worker.js'
$analysisEntry = Join-Path $release 'worker\src\analysisWorker.js'
if ($workerEntry -ne ('"' + $expectedWorkerEntry + '"') -or -not (Test-Path -LiteralPath $analysisEntry -PathType Leaf)) { throw 'Active Worker release does not contain the analysis entry' }
if ([string]$worker.service.workingdirectory -ne (Join-Path $release 'worker')) { throw 'Active Worker working directory mismatch' }
$workerEnv = @{}
foreach ($item in @($worker.service.env)) { $workerEnv[[string]$item.name] = [string]$item.value }
$envFile = $workerEnv['PUBLIC_OPINION_ENV_FILE']
if (-not $envFile -or -not (Test-Path -LiteralPath $envFile -PathType Leaf)) { throw 'Active Worker environment file is unavailable' }
if (((Get-Item -LiteralPath $envFile -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Worker environment file must not be a reparse point' }
if ($workerEnv['PUBLIC_OPINION_SERVICE_MODE'] -ne '1' -or $workerEnv['WORKER_MODE'] -ne 'enabled') { throw 'Active Worker mode mismatch' }
$manifest = Join-Path $release 'package-worker-release-manifest.json'
if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) { throw 'Active Worker release manifest is missing' }
$buildSha = (Get-FileHash -LiteralPath $manifest -Algorithm SHA256).Hash
if ($workerEnv['BUILD_SHA'] -ne $buildSha) { throw 'Active Worker release manifest hash mismatch' }

function Assert-AnalysisConfig([string]$Path) {
    [xml]$config = Get-Content -Raw -LiteralPath $Path
    if ([string]$config.service.id -ne $name -or [string]$config.service.arguments -ne ('"' + $analysisEntry + '"')) { throw 'Analysis service entry mismatch' }
    if ([string]$config.service.workingdirectory -ne (Join-Path $release 'worker')) { throw 'Analysis service release mismatch' }
    if ([string]$config.service.executable -ne [string]$worker.service.executable) { throw 'Analysis service Node executable mismatch' }
    $environment = @{}
    foreach ($item in @($config.service.env)) { $environment[[string]$item.name] = [string]$item.value }
    if ($environment['PUBLIC_OPINION_ENV_FILE'] -ne $envFile -or $environment['PUBLIC_OPINION_SERVICE_MODE'] -ne '1' -or $environment['WORKER_MODE'] -ne 'enabled') { throw 'Analysis service environment mismatch' }
    if ($environment.ContainsKey('BUILD_SHA') -and $environment['BUILD_SHA'] -ne $buildSha) { throw 'Analysis service build hash mismatch' }
    if ([string]$config.service.startmode -ne 'Automatic' -or [string]$config.service.delayedAutoStart -ne 'true') { throw 'Analysis service automatic start is missing' }
    $recovery = @($config.service.onfailure)
    if ($recovery.Count -ne 3 -or (@($recovery | ForEach-Object { "$($_.action):$($_.delay)" }) -join ',') -ne 'restart:5 sec,restart:30 sec,restart:60 sec') { throw 'Analysis service restart recovery mismatch' }
    if ([string]$config.service.serviceaccount.domain -ne 'NT AUTHORITY' -or [string]$config.service.serviceaccount.user -ne 'LocalService') { throw 'Analysis service account mismatch' }
}

$existing = Get-Service -Name $name -ErrorAction SilentlyContinue
if ($existing) {
    if (-not (Test-Path -LiteralPath $analysisXmlPath -PathType Leaf) -or -not (Test-Path -LiteralPath $analysisExe -PathType Leaf)) { throw 'Installed AnalysisWorker artifacts are incomplete' }
    Assert-AnalysisConfig $analysisXmlPath
    if ((Get-FileHash -LiteralPath $analysisExe -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $workerExe -Algorithm SHA256).Hash) { throw 'AnalysisWorker wrapper differs from Worker' }
    if ($Mode -eq 'Apply' -and $existing.Status -ne 'Running') { Start-Service -Name $name; $existing.WaitForStatus('Running', [TimeSpan]::FromSeconds(30)) }
    Write-Output "PASS: $name $($existing.Status); release=$release; env=$envFile; automatic restart configured"
    exit 0
}

[xml]$template = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot "$name.xml")
$template.service.executable = [string]$worker.service.executable
$template.service.arguments = '"' + $analysisEntry + '"'
$template.service.workingdirectory = Join-Path $release 'worker'
$template.service.logpath = Join-Path $LogRoot $name
foreach ($item in @($template.service.env)) {
    if ($item.name -eq 'PUBLIC_OPINION_ENV_FILE') { $item.value = $envFile }
    if ($item.name -eq 'BUILD_SHA') { $item.value = $buildSha }
}
if ($Mode -eq 'Preflight') {
    Write-Output "PASS: $name install preflight; release=$release; env=$envFile; no SCM or file changes"
    exit 0
}

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Apply requires an elevated administrator terminal' }
if (Test-Path -LiteralPath $analysisExe -PathType Leaf) { throw 'Unregistered AnalysisWorker wrapper already exists; manual inspection required' }
if (Test-Path -LiteralPath $analysisXmlPath -PathType Leaf) { throw 'Unregistered AnalysisWorker XML already exists; manual inspection required' }
$logDirectory = Join-Path $LogRoot $name
$createdLog = -not (Test-Path -LiteralPath $logDirectory)
$createdWrapper = $false
$createdXml = $false
try {
    if ($createdLog) {
        New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
        Set-Acl -LiteralPath $logDirectory -AclObject (Get-Acl -LiteralPath (Join-Path $LogRoot 'PublicOpinionWorker'))
    }
    Copy-Item -LiteralPath $workerExe -Destination $analysisExe
    $createdWrapper = $true
    $template.Save($analysisXmlPath)
    $createdXml = $true
    Assert-AnalysisConfig $analysisXmlPath
    & $analysisExe install
    if ($LASTEXITCODE -ne 0) { throw 'AnalysisWorker WinSW install failed' }
    Start-Service -Name $name
    (Get-Service -Name $name).WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
    Write-Output "PASS: $name installed and Running from $release using $envFile"
} catch {
    $originalFailure = $_
    if ($createdWrapper -and $createdXml) {
        $registered = @(Get-Service -ErrorAction Stop | Where-Object Name -eq $name)
        if ($registered.Count) {
            if ($registered[0].Status -ne 'Stopped') {
                & $analysisExe stop | Out-Null
                if ($LASTEXITCODE -ne 0) { throw 'Rollback stop failed; wrapper/XML retained for recovery' }
            }
            & $analysisExe uninstall | Out-Null
            if ($LASTEXITCODE -ne 0) { throw 'Rollback uninstall failed; wrapper/XML retained for recovery' }
            if (@(Get-Service -ErrorAction Stop | Where-Object Name -eq $name).Count) { throw 'Service remains registered; wrapper/XML retained for recovery' }
        }
    }
    if ($createdXml -and (Test-Path -LiteralPath $analysisXmlPath)) { Remove-Item -LiteralPath $analysisXmlPath -Force }
    if ($createdWrapper -and (Test-Path -LiteralPath $analysisExe)) { Remove-Item -LiteralPath $analysisExe -Force }
    throw $originalFailure
}
