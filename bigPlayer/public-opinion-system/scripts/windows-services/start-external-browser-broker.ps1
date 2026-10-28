param([string]$ReleaseRoot,[string]$EnvFile='E:/CodexData/public-opinion/config/runtime.env')
$ErrorActionPreference='Stop'
if(-not $ReleaseRoot){
  [xml]$taskXml=[IO.File]::ReadAllText('E:/CodexData/public-opinion/login-session-service/services/PublicOpinionLoginSession.xml')
  $ReleaseRoot=Split-Path ([string]$taskXml.service.workingdirectory)
  $EnvFile=[string]($taskXml.service.env | Where-Object {$_.name -eq 'PUBLIC_OPINION_ENV_FILE'}).value
}
$taskEntry=Join-Path $ReleaseRoot 'login-session-service/src/externalBrowserBroker.js'
if(-not (Test-Path -LiteralPath $taskEntry)){throw 'External browser broker is not installed in the active release'}
$taskNode=(Get-Command node.exe).Source
$env:PUBLIC_OPINION_ENV_FILE=$EnvFile
# The helper console stays hidden; its Facebook browser is intentionally visible.
Start-Process -FilePath $taskNode -ArgumentList ('"'+$taskEntry+'"') -WorkingDirectory $ReleaseRoot -WindowStyle Hidden
