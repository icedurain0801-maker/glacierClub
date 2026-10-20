$ErrorActionPreference = 'Stop'
$taskName = 'PublicOpinion BaaS New Content Sync'
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw 'Existing synchronization task is preserved. Inspect it before updating.' }
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$source = Join-Path $projectRoot 'worker/src/baasLiveWriter.js'
[xml]$apiService = Get-Content -LiteralPath 'C:/ProgramData/PublicOpinion/services/PublicOpinionApi.xml' -Raw
$runtimeRoot = Split-Path ([string]$apiService.service.workingdirectory) -Parent
if (-not (Test-Path -LiteralPath (Join-Path $runtimeRoot 'server/src/db/repository.js'))) { throw 'Current API runtime repository was not found' }
if (-not (Test-Path -LiteralPath 'C:/ProgramData/PublicOpinion/config/baas-data-token.dpapi')) { throw 'Encrypted data credential is required' }
$release = 'C:/ProgramData/PublicOpinion/baas-live/releases/release-20261014-new-data-r1'
if (Test-Path -LiteralPath $release) { throw 'Release already exists; do not overwrite it' }
New-Item -ItemType Directory -Path $release -Force | Out-Null
Copy-Item -LiteralPath $source -Destination (Join-Path $release 'baasLiveWriter.js')
$node = 'C:/Program Files/nodejs/node.exe'
$envFile = & $node -p "require('node:path').join(require('node:fs').realpathSync.native('C:/ProgramData/PublicOpinion'),'config','public-opinion.env')"
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve runtime configuration directory' }
$quotedEnvFile = ConvertTo-Json -InputObject ([string]$envFile) -Compress
$quotedRoot = ConvertTo-Json -InputObject $runtimeRoot -Compress
$entry = @"
process.env.PUBLIC_OPINION_SERVICE_MODE='1';
process.env.PUBLIC_OPINION_ENV_FILE=$quotedEnvFile;
process.env.PUBLIC_OPINION_RUNTIME_ROOT=$quotedRoot;
require('./baasLiveWriter').main();
"@
$entryPath = Join-Path $release 'entry.cjs'
[IO.File]::WriteAllText($entryPath, $entry, [Text.UTF8Encoding]::new($false))
$node = 'C:/Program Files/nodejs/node.exe'
& $node --check $entryPath
if ($LASTEXITCODE -ne 0) { throw 'Entry syntax check failed' }
& $node $entryPath
if ($LASTEXITCODE -ne 0) { throw 'First synchronization failed; scheduled task was not registered' }
$action = New-ScheduledTaskAction -Execute $node -Argument ('"' + $entryPath + '"') -WorkingDirectory $release
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Sync only content collected since the persisted cutover into BaaS; original collection and analysis schedules remain unchanged.' | Out-Null
[pscustomobject]@{ taskName=$taskName; release=$release; runtimeRoot=$runtimeRoot; intervalSeconds=60 } | ConvertTo-Json -Compress
