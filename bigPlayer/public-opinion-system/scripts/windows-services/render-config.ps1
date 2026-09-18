param(
    [Parameter(Mandatory)][Alias('AppRoot')][string]$SourceRoot,
    [string]$RuntimeRoot = 'C:\ProgramData\PublicOpinion\app\current',
    [Parameter(Mandatory)][string]$NodeExe,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [Parameter(Mandatory)][string]$LogRoot,
    [string]$ConfigFile = 'C:\ProgramData\PublicOpinion\config\public-opinion.env',
    [string]$DataRoot = 'C:\ProgramData\PublicOpinion\data',
    [string]$WorkerBuildSha,
    [ValidateSet('PublicOpinionApi', 'PublicOpinionWorker', 'PublicOpinionTranslationWorker', 'All')][string]$ServiceName = 'All'
)
$ErrorActionPreference = 'Stop'
$resolvedSourceRoot = (Resolve-Path -LiteralPath $SourceRoot).Path
$resolvedRuntimeRoot = [System.IO.Path]::GetFullPath($RuntimeRoot)
$resolvedNode = (Resolve-Path -LiteralPath $NodeExe).Path
$resolvedOutput = (Resolve-Path -LiteralPath $OutputDirectory).Path
$resolvedLogRoot = (Resolve-Path -LiteralPath $LogRoot).Path
$resolvedConfigFile = [System.IO.Path]::GetFullPath($ConfigFile)
$resolvedDataRoot = [System.IO.Path]::GetFullPath($DataRoot)
$serviceNames = if ($ServiceName -eq 'All') { @('PublicOpinionApi', 'PublicOpinionWorker') } else { @($ServiceName) }
foreach ($serviceName in $serviceNames) {
    if ($serviceName -eq 'PublicOpinionWorker' -and $WorkerBuildSha -notmatch '^[A-Fa-f0-9]{64}$') {
        throw 'WorkerBuildSha must be a 64-character SHA-256 value'
    }
    [xml]$config = Get-Content -LiteralPath (Join-Path $PSScriptRoot "$serviceName.xml") -Raw
    $config.service.executable = [string]$resolvedNode
    $entry = if ($serviceName -eq 'PublicOpinionApi') { 'server\src\app.js' } elseif ($serviceName -eq 'PublicOpinionTranslationWorker') { 'worker\src\translationWorker.js' } else { 'worker\src\worker.js' }
    $entryRoot = $resolvedRuntimeRoot
    $entryPath = [string](Join-Path $entryRoot $entry)
    $config.service.arguments = [string]('"' + $entryPath + '"')
    $config.service.workingdirectory = [string](Split-Path -Parent (Split-Path -Parent $entryPath))
    $config.service.logpath = [string](Join-Path $resolvedLogRoot $serviceName)
    if ($serviceName -in @('PublicOpinionApi','PublicOpinionWorker','PublicOpinionTranslationWorker')) {
        foreach ($envNode in @($config.service.env)) {
            if ([string]$envNode.name -eq 'PUBLIC_OPINION_ENV_FILE') { $envNode.value = [string]$resolvedConfigFile }
            if ([string]$envNode.name -eq 'Q1_DAILY_OUT_ROOT') { $envNode.value = [string]$resolvedDataRoot }
            if ([string]$envNode.name -eq 'Q1_DAILY_LOCK_ROOT') { $envNode.value = [string](Join-Path $resolvedDataRoot 'locks') }
            if ([string]$envNode.name -eq 'WORKER_STATE_ROOT') { $envNode.value = [string](Join-Path $resolvedDataRoot 'state') }
            if ([string]$envNode.name -eq 'BUILD_SHA') { $envNode.value = [string]$WorkerBuildSha.ToUpperInvariant() }
        }
    }
    $config.Save((Join-Path $resolvedOutput "$serviceName.xml"))
}
