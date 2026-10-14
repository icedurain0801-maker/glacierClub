param(
  [Parameter(Mandatory)][ValidateSet('Preflight', 'Prepare')][string]$Mode,
  [Parameter(Mandatory)][string]$CandidateId,
  [Parameter(Mandatory)][string]$SourceRoot,
  [Parameter(Mandatory)][string]$WinSWSource,
  [string]$DeploymentRoot = 'C:\ProgramData\PublicOpinion\login-session-service'
)

$ErrorActionPreference = 'Stop'
$expectedWinSWHash = '05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA'
$serviceName = 'PublicOpinionLoginSession'

function Get-Sha256([string]$Path) { (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant() }
function Assert-Regular([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path)) { throw "$Label is missing" }
  if (((Get-Item -LiteralPath $Path -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw "$Label must not be a reparse point" }
}
function Set-LocalServiceAcl([string]$Path, [bool]$Writable) {
  $item = Get-Item -LiteralPath $Path -Force
  $acl = if ($item -is [System.IO.DirectoryInfo]) { New-Object System.Security.AccessControl.DirectorySecurity } else { New-Object System.Security.AccessControl.FileSecurity }
  $acl.SetAccessRuleProtection($true, $false)
  $inherit = if ($item -is [System.IO.DirectoryInfo]) { [System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit' } else { [System.Security.AccessControl.InheritanceFlags]::None }
  $allow = [System.Security.AccessControl.AccessControlType]::Allow
  foreach ($entry in @(
    @([System.Security.Principal.SecurityIdentifier]'S-1-5-18', [System.Security.AccessControl.FileSystemRights]::FullControl),
    @([System.Security.Principal.SecurityIdentifier]'S-1-5-32-544', [System.Security.AccessControl.FileSystemRights]::FullControl),
    @([System.Security.Principal.SecurityIdentifier]'S-1-5-19', $(if ($Writable) { [System.Security.AccessControl.FileSystemRights]::Modify } else { [System.Security.AccessControl.FileSystemRights]::ReadAndExecute }))
  )) { $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($entry[0], $entry[1], $inherit, [System.Security.AccessControl.PropagationFlags]::None, $allow))) }
  $item.SetAccessControl($acl)
}

if ($CandidateId -notmatch '^login-session-4311-[a-z0-9-]{8,80}$') { throw 'CandidateId must be immutable login-session-4311-<suffix>' }
$source = (Resolve-Path -LiteralPath $SourceRoot).Path
$winsw = (Resolve-Path -LiteralPath $WinSWSource).Path
if ((Get-Sha256 $winsw) -ne $expectedWinSWHash) { throw 'WinSW hash mismatch' }
foreach ($relative in @('login-session-service\package.json','login-session-service\package-lock.json','login-session-service\src\index.js','scripts\windows-services\LoginSessionService.xml')) { Assert-Regular (Join-Path $source $relative) $relative }
$config = 'C:\ProgramData\PublicOpinion\config\public-opinion.env'
Assert-Regular $config 'managed environment file'
$listener = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 4311 -State Listen -ErrorAction SilentlyContinue
if ($listener) { throw '127.0.0.1:4311 is already listening' }
if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) { throw "$serviceName is already installed" }

# Windows PowerShell 5.1 still encounters MAX_PATH limits while copying the
# Playwright closure.  Keep the disposable preflight root deliberately short.
$targetRoot = $DeploymentRoot
if ($Mode -eq 'Preflight') {
  $repositoryRoot = & git -C $source rev-parse --show-toplevel
  if ($LASTEXITCODE -ne 0 -or -not $repositoryRoot) { throw 'Preflight requires a source checkout to locate repository-root .temp' }
  $repositoryRoot = (Resolve-Path -LiteralPath $repositoryRoot).Path
  $targetRoot = Join-Path (Join-Path $repositoryRoot '.temp') ("ls-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
}
$stage = Join-Path (Join-Path $targetRoot 'candidate-staging') $CandidateId
# Keep the immutable candidate at its staging location until the separately
# gated service-install phase. This avoids a cross-tree move of Playwright's
# deep dependency path under Windows PowerShell 5.1.
$release = $stage
$services = Join-Path $targetRoot 'services'; $logs = Join-Path $targetRoot 'logs'; $audit = Join-Path $targetRoot 'audit'
if (Test-Path -LiteralPath $release) { throw 'candidate release already exists' }
New-Item -ItemType Directory -Path $stage,$services,$logs,$audit -Force | Out-Null
try {
  # Apply inheritable read/execute permission before copying the dependency
  # closure; this avoids PowerShell 5.1 long-path enumeration after copy.
  Set-LocalServiceAcl $stage $false
  $serviceSource = Join-Path $source 'login-session-service'
  $serviceTarget = Join-Path $stage 'login-session-service'
  Assert-Regular $serviceSource 'login-session-service'
  New-Item -ItemType Directory -Path $serviceTarget -Force | Out-Null
  foreach ($relative in @('package.json', 'package-lock.json', 'src')) {
    $itemPath = Join-Path $serviceSource $relative
    Assert-Regular $itemPath $relative
    if ((Get-Item -LiteralPath $itemPath).PSIsContainer) {
      foreach ($child in Get-ChildItem -LiteralPath $itemPath -Force -Recurse -ErrorAction Stop) {
        Assert-Regular $child.FullName $child.Name
        if ($child.Name -match '^\.env(?:\.|$)' -or $child.Name -in @('outputs', '.temp')) { throw "Forbidden candidate input: $($child.Name)" }
      }
    }
    Copy-Item -LiteralPath $itemPath -Destination $serviceTarget -Recurse -Force
  }
  Push-Location (Join-Path $stage 'login-session-service')
  try { & npm.cmd ci --omit=dev --ignore-scripts; if ($LASTEXITCODE -ne 0) { throw "npm ci failed: $LASTEXITCODE" } }
  finally { Pop-Location }
  # Node handles Playwright's deep tree consistently and explicitly validates
  # UTF-8/BOM/trailing-byte requirements before this candidate is retained.
  & node.exe (Join-Path $PSScriptRoot 'write-login-session-manifest.js') $stage --write
  if ($LASTEXITCODE -ne 0) { throw "manifest generation failed: $LASTEXITCODE" }
  Copy-Item -LiteralPath $winsw -Destination (Join-Path $services "$serviceName.exe") -Force
  $xml = Get-Content -LiteralPath (Join-Path $source 'scripts\windows-services\LoginSessionService.xml') -Raw
  $xml = $xml.Replace('%NODE_EXE%', (Get-Command node.exe).Source).Replace('%APP_ROOT%', $release).Replace('%PUBLIC_OPINION_ENV_FILE%', $config).Replace('%SERVICE_LOG_ROOT%', $logs)
  Set-Content -LiteralPath (Join-Path $services "$serviceName.xml") -Value $xml -Encoding UTF8
  New-Item -ItemType Directory -Path (Join-Path $logs $serviceName) -Force | Out-Null
  Set-LocalServiceAcl $release $false; Set-LocalServiceAcl $services $false; Set-LocalServiceAcl (Join-Path $services "$serviceName.exe") $false; Set-LocalServiceAcl (Join-Path $services "$serviceName.xml") $false; Set-LocalServiceAcl $logs $true; Set-LocalServiceAcl (Join-Path $logs $serviceName) $true
  $result = [ordered]@{ candidateId=$CandidateId; release=$release; serviceRoot=$services; wrapperSha256=(Get-Sha256 (Join-Path $services "$serviceName.exe")); manifestSha256=(Get-Sha256 (Join-Path $release 'manifest.json')); config=$config; port=4311; service=$serviceName }
  $result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $audit "$CandidateId.json") -Encoding UTF8
  Write-Output ($result | ConvertTo-Json -Compress)
} catch {
  @{ candidateId=$CandidateId; error=$_.Exception.Message; phase=$Mode } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $audit "$CandidateId.failure.json") -Encoding UTF8
  throw
} finally {
  if ($Mode -eq 'Preflight' -and (Test-Path -LiteralPath $targetRoot)) {
    # Node's filesystem implementation handles the Playwright dependency tree
    # consistently across the long-path behavior of Windows PowerShell 5.1.
    & node.exe -e "require('node:fs').rmSync(process.argv[1],{recursive:true,force:true,maxRetries:3})" $targetRoot
    if ($LASTEXITCODE -ne 0) { throw "Preflight cleanup failed: $LASTEXITCODE" }
  }
}
