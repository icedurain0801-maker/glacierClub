param(
    [Parameter(Mandatory=$true)][string]$PackageRoot,
    [ValidateSet('Status','Switch','UpdateDaily','EnableDaily','RunOnce','PauseDaily','RollbackOriginal')][string]$Mode='Status'
)
# Prepared commands only. Switch and rollback restart the shared collection
# service and must not be run under the current no-domestic-restart constraint.
$ErrorActionPreference='Stop'
$delivery=Get-Content -LiteralPath (Join-Path $PackageRoot 'delivery.json') -Raw | ConvertFrom-Json
$node='C:/Program Files/nodejs/node.exe'
$xmlPath='C:/ProgramData/PublicOpinion/services/PublicOpinionWorker.xml'
$state='C:/ProgramData/PublicOpinion/overseas-daily/state'
$logs='C:/ProgramData/PublicOpinion/overseas-daily/logs'
$taskName='BigPlayer Last Night Overseas Daily 02'
$env:PUBLIC_OPINION_SERVICE_MODE='1'
$env:PUBLIC_OPINION_ENV_FILE='C:/ProgramData/PublicOpinion/config/public-opinion.env'
$gate=Join-Path $delivery.dailyRoot 'scripts/overseas-worker-switch-gate.js'
function Invoke-Gate([string]$Argument) {
    $output=& $node $gate $Argument
    if($LASTEXITCODE -ne 0){throw 'Scan gate refused; no forced service stop'}
    return ($output | ConvertFrom-Json)
}
function Assert-Targets {
    foreach($target in @($delivery.sharedTarget,$delivery.dailyTarget)){
        $absolute=[IO.Path]::GetFullPath($target)
        if(-not $absolute.StartsWith('C:\ProgramData\PublicOpinion\',[StringComparison]::OrdinalIgnoreCase)){throw 'Release target outside PublicOpinion'}
    }
}
function Wait-ServiceState([string]$Status) {
    $service=Get-Service -Name PublicOpinionWorker
    $service.WaitForStatus([ServiceProcess.ServiceControllerStatus]::$Status,[TimeSpan]::FromSeconds(20))
}
function Invoke-Preflight {
    $env:OVERSEAS_DAILY_EXECUTION_ENABLED='true'
    $env:OVERSEAS_DAILY_STATE_DIRECTORY=$state
    $env:OVERSEAS_SHARED_EXCLUSION_MANIFEST=Join-Path $delivery.dailyTarget 'shared-exclusion.json'
    & $node (Join-Path $delivery.dailyTarget 'worker/src/overseasProductionDaily.js') --preflight
    if($LASTEXITCODE -ne 0){throw 'Deployed overseas preflight failed'}
}
function Set-OverseasTaskAction {
    # Updating the existing COM definition preserves its InteractiveToken
    # principal; Set-ScheduledTask may reject this principal without a password.
    $scheduler=New-Object -ComObject 'Schedule.Service'
    $scheduler.Connect()
    $folder=$scheduler.GetFolder('\')
    $registered=$folder.GetTask($taskName)
    $definition=$registered.Definition
    if($definition.Principal.LogonType -ne 3){throw 'Expected the original InteractiveToken task principal'}
    $definition.Actions.Clear()
    $action=$definition.Actions.Create(0)
    $action.Path='C:\Windows\System32\cmd.exe'
    $action.Arguments='/c "'+$delivery.launcher+'"'
    $action.WorkingDirectory=Join-Path $delivery.dailyTarget 'worker'
    $definition.Settings.Enabled=$false
    $null=$folder.RegisterTaskDefinition($taskName,$definition,4,$null,$null,$definition.Principal.LogonType,$null)
    $actual=$folder.GetTask($taskName).Definition
    if($actual.Settings.Enabled -or $actual.Actions.Count -ne 1 -or $actual.Actions.Item(1).Path -ne $action.Path -or $actual.Actions.Item(1).Arguments -ne $action.Arguments -or $actual.Actions.Item(1).WorkingDirectory -ne $action.WorkingDirectory){throw 'Actual overseas task action did not match the deployed launcher'}
}
Assert-Targets
if($Mode -eq 'Status'){Invoke-Gate '--status' | ConvertTo-Json -Depth 5;return}
if($Mode -eq 'UpdateDaily'){
    $task=Get-ScheduledTask -TaskName $taskName
    if($task.State -eq 'Running' -or $task.Settings.Enabled){throw 'Disable and drain the actual task before updating its release'}
    $status=Invoke-Gate '--status'
    if($null -ne $status.overseas.connectionId){throw 'Overseas consumer still owns its lock; refusing daily update'}
    if(Test-Path -LiteralPath $delivery.dailyTarget){throw 'Immutable daily release already exists'}
    Copy-Item -LiteralPath $delivery.dailyRoot -Destination $delivery.dailyTarget -Recurse
    Invoke-Preflight
    Set-OverseasTaskAction
    [pscustomobject]@{status='DAILY_UPDATED';overseasTaskEnabled=$false;sharedWorkerRestarted=$false} | ConvertTo-Json
    return
}
if($Mode -eq 'PauseDaily'){
    Disable-ScheduledTask -TaskName $taskName | Out-Null
    New-Item -ItemType File -Path (Join-Path $state 'STOP') -Force | Out-Null
    Invoke-Gate '--status' | ConvertTo-Json -Depth 5
    return
}
if($Mode -eq 'EnableDaily' -or $Mode -eq 'RunOnce'){
    if(Test-Path -LiteralPath (Join-Path $state 'STOP')){throw 'STOP exists; review drain and archive STOP before re-enabling'}
    Invoke-Preflight
    if($Mode -eq 'EnableDaily'){Enable-ScheduledTask -TaskName $taskName | Out-Null}
    else{
        if((Get-ScheduledTask -TaskName $taskName).State -eq 'Running'){throw 'Overseas task already running; do not repeat the trigger'}
        try{
            $previousRun=(Get-ScheduledTaskInfo -TaskName $taskName).LastRunTime
            Enable-ScheduledTask -TaskName $taskName | Out-Null
            Start-ScheduledTask -TaskName $taskName
            $deadline=[DateTime]::UtcNow.AddSeconds(5)
            while((Get-ScheduledTaskInfo -TaskName $taskName).LastRunTime -eq $previousRun){
                if([DateTime]::UtcNow -ge $deadline){throw 'The actual task has not started; inspect task scheduler before retrying'}
                Start-Sleep -Milliseconds 200
            }
        }
        finally{Disable-ScheduledTask -TaskName $taskName | Out-Null}
    }
    return
}
if($Mode -eq 'Switch'){
    if((Get-FileHash -LiteralPath $xmlPath).Hash -ne (Get-FileHash -LiteralPath (Join-Path $PackageRoot 'PublicOpinionWorker.before.xml')).Hash){throw 'Current service configuration changed; refusing overwrite'}
    foreach($pair in @(@($delivery.sharedRoot,$delivery.sharedTarget),@($delivery.dailyRoot,$delivery.dailyTarget))){
        if(Test-Path -LiteralPath $pair[1]){throw 'Immutable release target already exists'}
        New-Item -ItemType Directory -Path (Split-Path $pair[1]) -Force | Out-Null
        Copy-Item -LiteralPath $pair[0] -Destination $pair[1] -Recurse
    }
    foreach($directory in @($state,$logs)){New-Item -ItemType Directory -Path $directory -Force | Out-Null}
    $task=Get-ScheduledTask -TaskName $taskName
    Export-ScheduledTask -TaskName $taskName | Set-Content -LiteralPath (Join-Path $PackageRoot 'OverseasTask.before.xml') -Encoding utf8
    # Preserve the existing task principal; grant only its private state/log paths.
    foreach($directory in @($state,$logs)){
        & icacls.exe $directory /grant ($task.Principal.UserId+':(OI)(CI)M') | Out-Null
        if($LASTEXITCODE -ne 0){throw 'Private directory ACL failed'}
    }
    Disable-ScheduledTask -TaskName $taskName | Out-Null
} else {
    Disable-ScheduledTask -TaskName $taskName | Out-Null
    New-Item -ItemType File -Path (Join-Path $state 'STOP') -Force | Out-Null
    $status=Invoke-Gate '--status'
    if($null -ne $status.overseas.connectionId){throw 'Overseas consumer still draining; preserve original service until it exits'}
    $env:OVERSEAS_DAILY_STATE_DIRECTORY=$state
    # Retire candidate queued/expired running states so original v055 cannot
    # reclaim the new collector's recoverable rows after domestic rollback.
    $null=Invoke-Gate '--retire-overseas'
}
$env:OVERSEAS_SWITCH_GATE_FILE=Join-Path $PackageRoot ('switch-gate-'+[Guid]::NewGuid().ToString()+'.json')
$gateOwned=$false
try{
    $null=Invoke-Gate '--acquire';$gateOwned=$true
    Stop-Service -Name PublicOpinionWorker
    Wait-ServiceState 'Stopped'
    if($Mode -eq 'RollbackOriginal'){
        Copy-Item -LiteralPath (Join-Path $PackageRoot 'PublicOpinionWorker.before.xml') -Destination $xmlPath -Force
    }else{
        [xml]$serviceXml=Get-Content -LiteralPath $xmlPath -Raw
        $serviceXml.service.arguments='"'+(Join-Path $delivery.sharedTarget 'worker/src/worker.js')+'"'
        $serviceXml.service.workingdirectory=Join-Path $delivery.sharedTarget 'worker'
        $serviceXml.Save($xmlPath)
    }
    Start-Service -Name PublicOpinionWorker
    Wait-ServiceState 'Running'
    if($Mode -eq 'Switch'){
        Invoke-Preflight
        Set-OverseasTaskAction
    }
}catch{
    # Domestic recovery takes precedence over retaining the exclusion patch.
    # This switch has not enabled the overseas task; it is safe to restore v055.
    if($Mode -eq 'Switch' -and $gateOwned){
        Stop-Service -Name PublicOpinionWorker -ErrorAction SilentlyContinue
        Wait-ServiceState 'Stopped'
        Copy-Item -LiteralPath (Join-Path $PackageRoot 'PublicOpinionWorker.before.xml') -Destination $xmlPath -Force
        Start-Service -Name PublicOpinionWorker
        Wait-ServiceState 'Running'
    }
    throw
}finally{
    if($gateOwned){$null=Invoke-Gate '--release'}
}
[pscustomobject]@{status='APPLIED';mode=$Mode;overseasTaskEnabled=$false} | ConvertTo-Json
