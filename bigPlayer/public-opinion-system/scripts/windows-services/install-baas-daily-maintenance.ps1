param([switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
if ((Get-TimeZone).Id -ne 'China Standard Time') { throw 'Expected Beijing timezone' }
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$destination = 'E:\CodexData\public-opinion\maintenance\runtime'
$files = @('baas-retention-policy.cjs','baas-retention-daily.cjs','baas-shard-gc-daily.cjs','baas-maintenance-health.cjs','windows-services\baas-daily-maintenance.ps1')
foreach ($name in $files) {
    $file = Join-Path $source $name
    if (-not (Test-Path -LiteralPath $file)) { throw "Missing runtime file: $name" }
    if ($name.EndsWith('.cjs')) { & node --check $file; if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $name" } }
}
if ($ValidateOnly) { Write-Output 'VALIDATED'; exit 0 }
New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
& icacls.exe (Split-Path $destination) /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Maintenance ACL failed' }
foreach ($name in $files) {
    $target = Join-Path $destination $name
    New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $source $name) -Destination $target -Force
    if ((Get-FileHash (Join-Path $source $name)).Hash -ne (Get-FileHash $target).Hash) { throw 'Runtime copy mismatch' }
}
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + (Join-Path $destination 'windows-services\baas-daily-maintenance.ps1') + '"') -WorkingDirectory $destination
$trigger = New-ScheduledTaskTrigger -Daily -At '04:00'
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
# No hard kill or missed-run catch-up: protects finally/sync restoration and respects 04:00.
Register-ScheduledTask -TaskName 'PublicOpinion BaaS Daily Cleanup' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Daily 04:00 Beijing: BaaS 15-day retention with protected alerts/quality and safe orphan-shard GC; backups and health gates; MySQL read-only.' -Force | Out-Null
Get-ScheduledTaskInfo -TaskName 'PublicOpinion BaaS Daily Cleanup' | Select-Object NextRunTime
