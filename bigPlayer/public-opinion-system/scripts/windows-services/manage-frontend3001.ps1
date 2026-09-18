param(
    [ValidateSet('DryRun', 'Preflight', 'Apply')][string]$Mode = 'DryRun',
    [string]$ConfirmApply,
    [string]$WinSWSource = (Join-Path $PSScriptRoot 'winsw.exe'),
    [string]$NodeExe = (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    [string]$ProgramDataRoot = (Join-Path $env:ProgramData 'PublicOpinion\frontend3001')
)
$ErrorActionPreference = 'Stop'
$serviceName = 'PublicOpinionFrontend3001'
$expectedWinSWHash = '05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA'
$sourceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path

function Get-Sha256([string]$Path) {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try { return [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
        finally { $sha.Dispose() }
    } finally { $stream.Dispose() }
}
function Assert-DirectChild([string]$Child, [string]$Parent, [string]$Label) {
    $childPath = [System.IO.Path]::GetFullPath($Child).TrimEnd('\')
    $parentPath = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\')
    if ([System.IO.Path]::GetFullPath((Split-Path -Parent $childPath)).TrimEnd('\') -ne $parentPath -or $childPath -eq $parentPath) {
        throw "$Label must be a direct child of $parentPath"
    }
}
function New-StrictSecurity([bool]$Directory, [System.Security.AccessControl.FileSystemRights]$LocalServiceRights) {
    $security = if ($Directory) { New-Object System.Security.AccessControl.DirectorySecurity } else { New-Object System.Security.AccessControl.FileSecurity }
    $security.SetAccessRuleProtection($true, $false)
    $inheritance = if ($Directory) { [System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit' } else { [System.Security.AccessControl.InheritanceFlags]::None }
    $none = [System.Security.AccessControl.PropagationFlags]::None
    $allow = [System.Security.AccessControl.AccessControlType]::Allow
    $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    foreach ($entry in @(
        @([System.Security.Principal.SecurityIdentifier]'S-1-5-18', [System.Security.AccessControl.FileSystemRights]::FullControl),
        @([System.Security.Principal.SecurityIdentifier]'S-1-5-32-544', [System.Security.AccessControl.FileSystemRights]::FullControl),
        @($currentSid, [System.Security.AccessControl.FileSystemRights]::ReadAndExecute),
        @([System.Security.Principal.SecurityIdentifier]'S-1-5-19', $LocalServiceRights)
    )) {
        $security.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($entry[0], $entry[1], $inheritance, $none, $allow)))
    }
    return $security
}
function Set-StrictAcl([string]$Path, [System.Security.AccessControl.FileSystemRights]$LocalServiceRights, [switch]$Recurse) {
    $root = Get-Item -LiteralPath $Path -Force
    $items = @($root)
    if ($Recurse -and $root -is [System.IO.DirectoryInfo]) { $items += @(Get-ChildItem -LiteralPath $Path -Force -Recurse) }
    foreach ($item in $items) {
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Reparse point is forbidden: $($item.FullName)" }
        $item.SetAccessControl((New-StrictSecurity -Directory ($item -is [System.IO.DirectoryInfo]) -LocalServiceRights $LocalServiceRights))
    }
}
function Assert-LocalServiceAcl([string]$Path, [System.Security.AccessControl.FileSystemRights]$Required, [bool]$Writable) {
    $acl = (Get-Item -LiteralPath $Path -Force).GetAccessControl([System.Security.AccessControl.AccessControlSections]::Access)
    if (-not $acl.AreAccessRulesProtected) { throw "ACL inheritance must be disabled: $Path" }
    $localService = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]) | Where-Object {
        $_.IdentityReference.Value -eq 'S-1-5-19' -and $_.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow
    })
    $rights = [System.Security.AccessControl.FileSystemRights]0
    foreach ($rule in $localService) { $rights = $rights -bor $rule.FileSystemRights }
    if (($rights -band $Required) -ne $Required) { throw "LocalService rights missing on $Path" }
    $writeRights = [System.Security.AccessControl.FileSystemRights](2 -bor 4 -bor 16 -bor 64 -bor 256 -bor 65536 -bor 262144 -bor 524288)
    if (-not $Writable -and ($rights -band $writeRights) -ne 0) { throw "LocalService write-capable rights are forbidden on $Path" }
}
function Write-FrontendConfig([string]$Path) {
    $payload = [ordered]@{ listenHost = '::'; listenPort = 3001; upstreamOrigin = 'http://127.0.0.1:4320' }
    [System.IO.File]::WriteAllText($Path, (($payload | ConvertTo-Json) + "`n"), (New-Object System.Text.UTF8Encoding($false)))
}
function Assert-FrontendConfig([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Frontend config must not be a reparse point' }
    $value = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    if ([string]$value.listenHost -ne '::' -or [int]$value.listenPort -ne 3001 -or [string]$value.upstreamOrigin -ne 'http://127.0.0.1:4320') {
        throw 'Frontend config must bind :::3001 and use http://127.0.0.1:4320'
    }
}
function Render-ServiceXml([string]$RuntimeRoot, [string]$ConfigFile, [string]$ServiceRoot, [string]$LogRoot, [string]$ResolvedNode) {
    [xml]$xml = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'PublicOpinionFrontend3001.xml') -Raw
    $xml.service.executable = [string]$ResolvedNode
    $xml.service.arguments = [string]('"' + (Join-Path $RuntimeRoot 'frontend3001-server.js') + '"')
    $xml.service.workingdirectory = [string]$RuntimeRoot
    $xml.service.logpath = [string]$LogRoot
    foreach ($envNode in @($xml.service.env)) {
        if ([string]$envNode.name -eq 'FRONTEND3001_CONFIG_FILE') { $envNode.value = [string]$ConfigFile }
    }
    $output = Join-Path $ServiceRoot "$serviceName.xml"
    $xml.Save($output)
    return $output
}
function Assert-Artifacts([string]$RuntimeRoot, [string]$ConfigFile, [string]$ServiceRoot, [string]$LogRoot, [string]$ResolvedNode, [string]$ResolvedWinSW) {
    & node.exe (Join-Path $PSScriptRoot 'verify-frontend3001-release.js') $RuntimeRoot
    if ($LASTEXITCODE -ne 0) { throw 'Frontend3001 release validation failed' }
    $wrapper = Join-Path $ServiceRoot "$serviceName.exe"
    $xmlPath = Join-Path $ServiceRoot "$serviceName.xml"
    if ((Get-Sha256 $wrapper) -ne (Get-Sha256 $ResolvedWinSW)) { throw 'Deployed WinSW hash mismatch' }
    [xml]$xml = Get-Content -LiteralPath $xmlPath -Raw
    if ([string]$xml.service.id -ne $serviceName -or [string]$xml.service.name -ne $serviceName) { throw 'Frontend3001 service identity mismatch' }
    if ([string]$xml.service.executable -ne $ResolvedNode) { throw 'Frontend3001 Node executable mismatch' }
    if ([string]$xml.service.workingdirectory -ne $RuntimeRoot) { throw 'Frontend3001 working directory mismatch' }
    if ([string]$xml.service.logpath -ne $LogRoot) { throw 'Frontend3001 log path mismatch' }
    if ([string]$xml.service.serviceaccount.domain -ne 'NT AUTHORITY' -or [string]$xml.service.serviceaccount.user -ne 'LocalService') { throw 'Frontend3001 must use LocalService' }
    if ([string]$xml.service.startmode -ne 'Automatic' -or [string]$xml.service.delayedAutoStart -ne 'true') { throw 'Frontend3001 automatic delayed start is missing' }
    if (@($xml.service.onfailure).Count -ne 3) { throw 'Frontend3001 restart recovery sequence is incomplete' }
    $configEnv = @($xml.service.env | Where-Object { [string]$_.name -eq 'FRONTEND3001_CONFIG_FILE' })
    if ($configEnv.Count -ne 1 -or [string]$configEnv[0].value -ne $ConfigFile) { throw 'Frontend3001 config environment mismatch' }
    if ((Get-Content -LiteralPath $xmlPath -Raw) -match '%(?:NODE_EXE|RUNTIME_ROOT|CONFIG_FILE|LOG_ROOT)%') { throw 'Unresolved placeholder remains in Frontend3001 XML' }
    Assert-FrontendConfig $ConfigFile
    $read = [System.Security.AccessControl.FileSystemRights]::ReadAndExecute
    $modify = [System.Security.AccessControl.FileSystemRights]::Modify
    foreach ($readOnlyPath in @($RuntimeRoot, $ConfigFile, $wrapper, $xmlPath)) { Assert-LocalServiceAcl $readOnlyPath $read $false }
    Assert-LocalServiceAcl $LogRoot $modify $true
}

if ($Mode -eq 'DryRun') {
    Write-Output "[dry-run] service=$serviceName"
    Write-Output "[dry-run] ProgramDataRoot=$ProgramDataRoot"
    Write-Output '[dry-run] Would create an immutable release, independent config/services/logs, strict LocalService ACLs, and a WinSW automatic service.'
    Write-Output '[dry-run] No file, ACL, service, task, listener, process, or production configuration was changed.'
    return
}
if ($Mode -eq 'Apply' -and $ConfirmApply -cne 'INSTALL-AND-START-PUBLIC-OPINION-FRONTEND-3001') {
    throw 'Apply requires -ConfirmApply INSTALL-AND-START-PUBLIC-OPINION-FRONTEND-3001'
}

$resolvedWinSW = (Resolve-Path -LiteralPath $WinSWSource).Path
$resolvedNode = (Resolve-Path -LiteralPath $NodeExe).Path
if ((Get-Sha256 $resolvedWinSW) -ne $expectedWinSWHash) { throw "WinSW SHA-256 mismatch: expected $expectedWinSWHash" }
$preflightRoot = $null
$serviceInstalled = $false
$runtimeCreated = $false
$wrapperCreated = $false
$xmlCreated = $false
$wrapper = $null
$serviceRoot = $null
$runtimeRoot = $null
$releaseBase = $null
try {
    if ($Mode -eq 'Preflight') {
        $tempRoot = Join-Path $sourceRoot '.temp'
        New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
        $preflightRoot = Join-Path $tempRoot ('f3001 pre ' + [guid]::NewGuid().ToString('N').Substring(0, 8))
        $effectiveRoot = $preflightRoot
        $releaseId = 'r'
    } else {
        $expectedRoot = [System.IO.Path]::GetFullPath((Join-Path $env:ProgramData 'PublicOpinion\frontend3001')).TrimEnd('\')
        $effectiveRoot = [System.IO.Path]::GetFullPath($ProgramDataRoot).TrimEnd('\')
        if ($effectiveRoot -ne $expectedRoot) { throw "Apply ProgramDataRoot must be $expectedRoot" }
        $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
        if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Apply requires an elevated Administrator shell' }
        if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) { throw "$serviceName is already installed; in-place upgrade is intentionally unsupported" }
        if (Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue) { throw 'Port 3001 is already listening; refusing parallel cutover' }
        $releaseId = 'release-' + (Get-Date -Format 'yyyyMMddHHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
    }
    $releaseBase = Join-Path $effectiveRoot 'releases'
    $runtimeRoot = Join-Path $releaseBase $releaseId
    $configRoot = Join-Path $effectiveRoot 'config'
    $configFile = Join-Path $configRoot 'frontend3001.json'
    $serviceRoot = Join-Path $effectiveRoot 'services'
    $logRoot = Join-Path $effectiveRoot 'logs'
    Assert-DirectChild $runtimeRoot $releaseBase 'RuntimeRoot'
    New-Item -ItemType Directory -Path $releaseBase, $configRoot, $serviceRoot, $logRoot -Force | Out-Null
    if ($Mode -eq 'Preflight' -or -not (Test-Path -LiteralPath $configFile)) { Write-FrontendConfig $configFile }
    Assert-FrontendConfig $configFile
    & (Join-Path $PSScriptRoot 'build-frontend3001-release.ps1') -SourceRoot $sourceRoot -RuntimeRoot $runtimeRoot
    $runtimeCreated = $true
    $wrapper = Join-Path $serviceRoot "$serviceName.exe"
    if ($Mode -eq 'Apply' -and (Test-Path -LiteralPath $wrapper)) { throw "Service wrapper already exists: $wrapper" }
    Copy-Item -LiteralPath $resolvedWinSW -Destination $wrapper
    $wrapperCreated = $true
    $xmlPath = Render-ServiceXml $runtimeRoot $configFile $serviceRoot $logRoot $resolvedNode
    $xmlCreated = $true
    $read = [System.Security.AccessControl.FileSystemRights]::ReadAndExecute
    $modify = [System.Security.AccessControl.FileSystemRights]::Modify
    Set-StrictAcl $effectiveRoot $read
    Set-StrictAcl $releaseBase $read
    Set-StrictAcl $runtimeRoot $read -Recurse
    Set-StrictAcl $configRoot $read
    Set-StrictAcl $configFile $read
    Set-StrictAcl $serviceRoot $read
    Set-StrictAcl $wrapper $read
    Set-StrictAcl $xmlPath $read
    Set-StrictAcl $logRoot $modify -Recurse
    Assert-Artifacts $runtimeRoot $configFile $serviceRoot $logRoot $resolvedNode $resolvedWinSW
    if ($Mode -eq 'Preflight') {
        Write-Output 'PASS: frontend3001 isolated preflight used the apply preparation path without SCM or production ProgramData access'
        return
    }
    & $wrapper install
    if ($LASTEXITCODE -ne 0) { throw "WinSW install failed with exit code $LASTEXITCODE" }
    $serviceInstalled = $true
    $service = Get-CimInstance Win32_Service -Filter "Name='$serviceName'"
    if (-not $service -or [string]$service.StartName -notin @('NT AUTHORITY\LocalService', 'NT AUTHORITY\LOCAL SERVICE')) { throw 'Installed service account is not LocalService' }
    & $wrapper start
    if ($LASTEXITCODE -ne 0) { throw "WinSW start failed with exit code $LASTEXITCODE" }
    $deadline = (Get-Date).AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 500
        $running = (Get-Service -Name $serviceName -ErrorAction SilentlyContinue).Status -eq 'Running'
        $listening = [bool](Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue)
    } until (($running -and $listening) -or (Get-Date) -ge $deadline)
    if (-not ($running -and $listening)) { throw 'Frontend3001 did not reach Running/listening state within 30 seconds' }
    Write-Output "PASS: $serviceName installed and started from immutable release $releaseId"
} catch {
    $originalError = $_
    if ($Mode -eq 'Apply') {
        if ($serviceInstalled -and $wrapper -and (Test-Path -LiteralPath $wrapper)) {
            & $wrapper stop *> $null
            & $wrapper uninstall *> $null
        }
        if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
            throw "Frontend3001 apply failed and SCM rollback is incomplete; preserving artifacts for recovery. Original error: $($originalError.Exception.Message)"
        }
        if ($wrapperCreated -and $wrapper -and (Test-Path -LiteralPath $wrapper)) { [System.IO.File]::Delete($wrapper) }
        if ($xmlCreated -and $serviceRoot) {
            $createdXml = Join-Path $serviceRoot "$serviceName.xml"
            if (Test-Path -LiteralPath $createdXml) { [System.IO.File]::Delete($createdXml) }
        }
        if ($runtimeCreated -and $runtimeRoot -and $releaseBase -and (Test-Path -LiteralPath $runtimeRoot)) {
            $releasePath = (Resolve-Path -LiteralPath $runtimeRoot).Path
            if ([System.IO.Path]::GetFullPath((Split-Path -Parent $releasePath)).TrimEnd('\') -eq [System.IO.Path]::GetFullPath($releaseBase).TrimEnd('\')) {
                & $resolvedNode -e "require('node:fs').rmSync(process.argv[1],{recursive:true,force:true,maxRetries:3})" $releasePath
            }
        }
    }
    throw $originalError
} finally {
    if ($Mode -eq 'Preflight' -and $preflightRoot -and (Test-Path -LiteralPath $preflightRoot)) {
        $resolvedPreflight = (Resolve-Path -LiteralPath $preflightRoot).Path
        $resolvedTemp = (Resolve-Path -LiteralPath (Join-Path $sourceRoot '.temp')).Path.TrimEnd('\')
        if (-not $resolvedPreflight.StartsWith(($resolvedTemp + '\'), [System.StringComparison]::OrdinalIgnoreCase)) { throw "Refusing preflight cleanup outside project .temp: $resolvedPreflight" }
        & node.exe -e "require('node:fs').rmSync(process.argv[1],{recursive:true,force:true,maxRetries:3})" $resolvedPreflight
        if ($LASTEXITCODE -ne 0) { throw "Preflight cleanup failed with exit code $LASTEXITCODE" }
    }
}
