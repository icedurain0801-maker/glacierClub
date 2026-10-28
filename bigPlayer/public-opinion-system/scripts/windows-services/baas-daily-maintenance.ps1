param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
$taskName = 'PublicOpinion BaaS New Content Sync'
$root = 'E:\CodexData\public-opinion\maintenance'
$scripts = Join-Path $PSScriptRoot '..'
$node = (Get-Command node.exe).Source
$mutex = [Threading.Mutex]::new($false, 'Global\PublicOpinionBaasDailyMaintenance')
$owned = $false
$exitCode = 1
try {
    try { $owned = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $owned = $true }
    if (-not $owned) { exit 0 }
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    $pending = Join-Path $root 'pending.json'
    if (-not $DryRun -and (Test-Path -LiteralPath $pending)) {
        $record = Get-Content -LiteralPath $pending -Raw | ConvertFrom-Json
        $run = [IO.Path]::GetFullPath($record.run)
        if (-not $run.StartsWith(([IO.Path]::GetFullPath($root) + '\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid pending path' }
        $restoreSync = [bool]$record.restoreSync
    } else {
        $run = Join-Path $root ((Get-Date -Format 'yyyyMMdd-HHmmss') + $(if ($DryRun) { '-dry-run' } else { '' }))
        $restoreSync = [bool](Get-ScheduledTask -TaskName $taskName).Settings.Enabled
    }
    New-Item -ItemType Directory -Path $run -Force | Out-Null
    $env:PO_MAINTENANCE_RUN_DIR = $run
    if (-not $DryRun) {
        @{run=$run;restoreSync=$restoreSync} | ConvertTo-Json | Set-Content -LiteralPath $pending -Encoding utf8
        Disable-ScheduledTask -TaskName $taskName | Out-Null
    }
    $statusPath = Join-Path $root 'status.json'
    @{status='running';run=$run;dryRun=[bool]$DryRun;startedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding utf8
    $log = Join-Path $run 'execution.log'
    & $node (Join-Path $scripts 'baas-maintenance-health.cjs') >> $log 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Baseline health failed' }
    $arguments = @((Join-Path $scripts 'baas-retention-daily.cjs'))
    if ($DryRun) { $arguments += '--dry-run' }
    & $node @arguments >> $log 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Content retention failed' }
    if (-not $DryRun) {
        # Fresh GC state follows retention publication, with its own cache grace and protected union.
        $gcRun = Join-Path $run 'shards'
        New-Item -ItemType Directory -Path $gcRun -Force | Out-Null
        $env:PO_MAINTENANCE_RUN_DIR = $gcRun
        & $node (Join-Path $scripts 'baas-shard-gc-daily.cjs') >> $log 2>&1
        if ($LASTEXITCODE -ne 0) { throw 'Shard cleanup failed' }
    }
    $env:PO_MAINTENANCE_RUN_DIR = $run
    & $node (Join-Path $scripts 'baas-maintenance-health.cjs') >> $log 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Final health failed' }
    if (-not $DryRun) { Remove-Item -LiteralPath $pending }
    $exitCode = 0
} catch {
    if ($run) { $_.Exception.Message | Add-Content -LiteralPath (Join-Path $run 'error.log') }
} finally {
    if ($owned) {
        $syncRestored = $DryRun.IsPresent
        if (-not $DryRun -and $restoreSync) {
            try { Enable-ScheduledTask -TaskName $taskName | Out-Null; Start-ScheduledTask -TaskName $taskName; $syncRestored = $true }
            catch { $exitCode = 1 }
        }
        if ($statusPath) { @{status=$(if ($exitCode -eq 0) {'completed'} else {'failed'});run=$run;dryRun=[bool]$DryRun;finishedAt=[DateTime]::UtcNow.ToString('o');syncRestored=$syncRestored} | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding utf8 }
        $mutex.ReleaseMutex()
    }
    $mutex.Dispose()
}
exit $exitCode
