$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $projectRoot '..\..')).Path
$tempRoot = Join-Path $workspaceRoot '.temp'
$probe = Join-Path $tempRoot ("analysis-worker-render-{0}" -f [guid]::NewGuid().ToString('N'))
$output = Join-Path $probe 'services'
$logs = Join-Path $probe 'logs'
$sha = 'A' * 64
try {
    New-Item -ItemType Directory -Path $output, $logs -Force | Out-Null
    & (Join-Path $projectRoot 'scripts\windows-services\render-config.ps1') `
        -SourceRoot $projectRoot -RuntimeRoot 'C:\test-release' `
        -NodeExe (Join-Path $env:SystemRoot 'System32\where.exe') `
        -OutputDirectory $output -LogRoot $logs -WorkerBuildSha $sha -ServiceName All
    $expected = @('PublicOpinionApi', 'PublicOpinionWorker', 'PublicOpinionAnalysisWorker')
    $actual = @(Get-ChildItem -LiteralPath $output -Filter '*.xml' -File | ForEach-Object BaseName)
    if (@(Compare-Object $expected $actual).Count -ne 0) { throw "All rendered unexpected services: $($actual -join ', ')" }
    [xml]$config = Get-Content -LiteralPath (Join-Path $output 'PublicOpinionAnalysisWorker.xml') -Raw
    if ([string]$config.service.id -ne 'PublicOpinionAnalysisWorker') { throw 'AnalysisWorker ID mismatch' }
    if ([string]$config.service.arguments -ne '"C:\test-release\worker\src\analysisWorker.js"') { throw 'AnalysisWorker entry mismatch' }
    if ([string]$config.service.workingdirectory -ne 'C:\test-release\worker') { throw 'AnalysisWorker working directory mismatch' }
    $environment = @{}
    foreach ($item in @($config.service.env)) { $environment[[string]$item.name] = [string]$item.value }
    if ($environment['BUILD_SHA'] -ne $sha -or $environment['WORKER_MODE'] -ne 'enabled') { throw 'AnalysisWorker environment mismatch' }
    if ([string]$config.service.startmode -ne 'Automatic' -or [string]$config.service.delayedAutoStart -ne 'true') { throw 'AnalysisWorker startup mismatch' }
    if ((@($config.service.onfailure | ForEach-Object { "$($_.action):$($_.delay)" }) -join ',') -ne 'restart:5 sec,restart:30 sec,restart:60 sec') { throw 'AnalysisWorker recovery mismatch' }
    Write-Output 'PASS: All renders API, Worker and AnalysisWorker with the analysis service contract'
} finally {
    if ([IO.Directory]::Exists($probe)) {
        $resolvedProbe = [IO.Path]::GetFullPath($probe)
        $resolvedTemp = [IO.Path]::GetFullPath($tempRoot).TrimEnd('\')
        if (-not $resolvedProbe.StartsWith("$resolvedTemp\", [StringComparison]::OrdinalIgnoreCase)) { throw "Refusing cleanup outside workspace .temp: $resolvedProbe" }
        [IO.Directory]::Delete($resolvedProbe, $true)
    }
}
