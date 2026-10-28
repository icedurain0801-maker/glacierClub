param([Parameter(Mandatory)][string]$PlanFile)
$ErrorActionPreference='Stop'
$root='C:\ProgramData\PublicOpinion\collection-check'
$plan=Get-Content -LiteralPath $PlanFile -Raw | ConvertFrom-Json
$scheduler=New-Object -ComObject 'Schedule.Service'
$scheduler.Connect()
$folder=$scheduler.GetFolder('\')
$template=$folder.GetTask('BigPlayer Last Night Overseas Daily 02').Definition
$expected=@()
foreach($entry in $plan){
    if($entry.sourceId -notmatch '^[a-f0-9-]{36}$' -or $entry.frequencySeconds -notin @(900,3600,21600,43200,86400) -or $entry.checkTime -notmatch '^([01]\d|2[0-3]):[0-5]\d$'){throw 'Invalid source check plan'}
    $name='PublicOpinion Source Check '+$entry.sourceId
    $expected+=$name
    $launcher=Join-Path $root ('launchers\'+$entry.sourceId+'.cmd')
    $lines=@('@echo off','setlocal','set "PUBLIC_OPINION_SERVICE_MODE=1"','set "PUBLIC_OPINION_ENV_FILE=C:\ProgramData\PublicOpinion\config\public-opinion.env"',('"C:\Program Files\nodejs\node.exe" "'+$root+'\runtime\source-check-runner.js" --check '+$entry.sourceId+' >> "'+$root+'\checks.log" 2>&1'),'exit /b %errorlevel%')
    [IO.File]::WriteAllText($launcher,($lines -join "`r`n"),[Text.Encoding]::ASCII)
    $definition=$scheduler.NewTask(0)
    $definition.Principal.UserId=$template.Principal.UserId
    $definition.Principal.LogonType=$template.Principal.LogonType
    $definition.Settings.Enabled=$true
    $definition.Settings.StartWhenAvailable=$false
    $definition.Settings.MultipleInstances=2
    $definition.Settings.ExecutionTimeLimit='PT2H'
    $trigger=$definition.Triggers.Create(2)
    $trigger.StartBoundary='2026-01-01T'+$entry.checkTime+':00'
    $trigger.DaysInterval=1
    if($entry.frequencySeconds -lt 86400){$trigger.Repetition.Interval='PT'+$entry.frequencySeconds+'S';$trigger.Repetition.Duration='P1D'}
    $action=$definition.Actions.Create(0)
    $action.Path='C:\Windows\System32\wscript.exe'
    $action.Arguments='//B //Nologo "'+$root+'\runtime\run-hidden-command.vbs" "'+$launcher+'"'
    $action.WorkingDirectory=$root
    $null=$folder.RegisterTaskDefinition($name,$definition,6,$null,$null,$definition.Principal.LogonType,$null)
}
# Disable only tasks owned by this feature when their source is disabled/removed.
foreach($task in $folder.GetTasks(0)){if($task.Name.StartsWith('PublicOpinion Source Check ') -and $task.Name -notin $expected){$task.Enabled=$false}}
# The shared Worker owns every source. Never re-enable the retired dedicated task.
$folder.GetTask('BigPlayer Last Night Overseas Daily 02').Enabled=$false
[pscustomobject]@{status='SOURCE_CHECK_TASKS_SYNCED';count=$expected.Count} | ConvertTo-Json -Compress
