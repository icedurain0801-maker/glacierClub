param(
  [Parameter(Mandatory=$true)][string]$Candidate,
  [string]$DbUrl,
  [string]$DbHost = '127.0.0.1',
  [int]$DbPort = 3306,
  [string]$DbUser = 'root',
  [string]$DbPassword = '',
  [string]$ProductionDbUrl,
  [string]$EvidenceDir
)
$ErrorActionPreference = 'Stop'
$nodeArgs = @((Join-Path $Candidate 'scripts\verify-candidate.js'), '--candidate', $Candidate, '--db-host', $DbHost, '--db-port', $DbPort, '--db-user', $DbUser)
if ($DbPassword) { $nodeArgs += @('--db-password', $DbPassword) }
if ($DbUrl) { $nodeArgs += @('--db-url', $DbUrl) }
if ($ProductionDbUrl) { $nodeArgs += @('--production-db-url', $ProductionDbUrl) }
if ($EvidenceDir) { $nodeArgs += @('--evidence-dir', $EvidenceDir) }
& node @nodeArgs
exit $LASTEXITCODE
