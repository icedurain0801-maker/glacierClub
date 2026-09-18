param(
    [Parameter(Mandatory)][ValidateSet('Apply', 'Preflight')][string]$Mode,
    [Parameter(Mandatory)][ValidateSet('PublicOpinionApi')][string]$TargetService,
    [Parameter(Mandatory)][string]$AppRoot,
    [Parameter(Mandatory)][string]$WinSWSource,
    [Parameter(Mandatory)][string]$NodeExe,
    [Parameter(Mandatory)][string]$RuntimeRoot,
    [Parameter(Mandatory)][string]$ReleaseBase,
    [string]$ServiceRoot,
    [string]$LogRoot,
    [string]$ConfigFile,
    [string]$DataRoot
)

$ErrorActionPreference = 'Stop'
$expectedWinSWHash = '05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA'
$resolvedAppRoot = (Resolve-Path -LiteralPath $AppRoot).Path
$resolvedWinSWSource = (Resolve-Path -LiteralPath $WinSWSource).Path
$resolvedNodeExe = (Resolve-Path -LiteralPath $NodeExe).Path

function Get-Sha256([string]$Path) {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        try { return [System.BitConverter]::ToString($sha256.ComputeHash($stream)).Replace('-', '') }
        finally { $sha256.Dispose() }
    } finally { $stream.Dispose() }
}

function Assert-DirectChild([string]$Child, [string]$Parent, [string]$Label) {
    $childPath = [System.IO.Path]::GetFullPath($Child).TrimEnd('\')
    $parentPath = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\')
    $actualParent = [System.IO.Path]::GetFullPath((Split-Path -Parent $childPath)).TrimEnd('\')
    if ($actualParent -ne $parentPath -or $childPath -eq $parentPath) { throw "$Label must be a direct child of $parentPath" }
}

function Assert-DistinctFilePath([string]$Source, [string]$Destination, [string]$Label) {
    $sourcePath = [System.IO.Path]::GetFullPath($Source).TrimEnd('\\')
    $destinationPath = [System.IO.Path]::GetFullPath($Destination).TrimEnd('\\')
    if ([string]::Equals($sourcePath, $destinationPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "WinSW source and $Label must not resolve to the same path: $sourcePath"
    }
}

function New-StrictSecurity([bool]$Directory, [System.Security.AccessControl.FileSystemRights]$LocalServiceRights) {
    $security = if ($Directory) { New-Object System.Security.AccessControl.DirectorySecurity } else { New-Object System.Security.AccessControl.FileSecurity }
    $security.SetAccessRuleProtection($true, $false)
    $inheritance = if ($Directory) { [System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit' } else { [System.Security.AccessControl.InheritanceFlags]::None }
    $propagation = [System.Security.AccessControl.PropagationFlags]::None
    $allow = [System.Security.AccessControl.AccessControlType]::Allow
    $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    foreach ($entry in @(
        @([System.Security.Principal.SecurityIdentifier]'S-1-5-18', [System.Security.AccessControl.FileSystemRights]::FullControl),
        @([System.Security.Principal.SecurityIdentifier]'S-1-5-32-544', [System.Security.AccessControl.FileSystemRights]::FullControl),
        @($currentSid, [System.Security.AccessControl.FileSystemRights]::ReadAndExecute),
        @([System.Security.Principal.SecurityIdentifier]'S-1-5-19', $LocalServiceRights)
    )) {
        $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($entry[0], $entry[1], $inheritance, $propagation, $allow)
        $security.AddAccessRule($rule)
    }
    return $security
}

function Set-StrictTreeAcl([string]$Path, [System.Security.AccessControl.FileSystemRights]$LocalServiceRights) {
    $rootItem = Get-Item -LiteralPath $Path -Force
    $items = @($rootItem)
    if ($rootItem -is [System.IO.DirectoryInfo]) { $items += @(Get-ChildItem -LiteralPath $Path -Force -Recurse) }
    foreach ($item in $items) {
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Reparse point is forbidden: $($item.FullName)" }
        $item.SetAccessControl((New-StrictSecurity -Directory ($item -is [System.IO.DirectoryInfo]) -LocalServiceRights $LocalServiceRights))
    }
}

function Set-StrictItemAcl([string]$Path, [System.Security.AccessControl.FileSystemRights]$LocalServiceRights) {
    $item = Get-Item -LiteralPath $Path -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Reparse point is forbidden: $($item.FullName)" }
    $item.SetAccessControl((New-StrictSecurity -Directory ($item -is [System.IO.DirectoryInfo]) -LocalServiceRights $LocalServiceRights))
}

if ((Get-Sha256 $resolvedWinSWSource) -ne $expectedWinSWHash) { throw "WinSW SHA-256 mismatch: expected $expectedWinSWHash" }

$preflightRoot = $null
$releaseCreated = $false
$createdServiceArtifacts = @()
try {
    if ($Mode -eq 'Preflight') {
        $tempRoot = Join-Path $resolvedAppRoot '.temp'
        New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
        $preflightRoot = Join-Path $tempRoot ("windows services preflight {0}" -f [guid]::NewGuid().ToString('N').Substring(0, 8))
        $effectiveReleaseBase = Join-Path $preflightRoot 'releases with spaces'
        $effectiveRuntimeRoot = Join-Path $effectiveReleaseBase 'release-test'
        $effectiveServiceRoot = Join-Path $preflightRoot 'services with spaces'
        $effectiveLogRoot = Join-Path $preflightRoot 'logs with spaces'
        $effectiveConfigFile = Join-Path $preflightRoot 'config with spaces\public-opinion.env'
        $effectiveDataRoot = Join-Path $preflightRoot 'data with spaces'
        New-Item -ItemType Directory -Path (Split-Path -Parent $effectiveConfigFile), $effectiveDataRoot -Force | Out-Null
        Set-Content -LiteralPath $effectiveConfigFile -Value "PORT=4320`n" -Encoding UTF8
    } else {
        foreach ($pair in @(@('ServiceRoot', $ServiceRoot), @('LogRoot', $LogRoot), @('ConfigFile', $ConfigFile), @('DataRoot', $DataRoot))) {
            if ([string]::IsNullOrWhiteSpace([string]$pair[1])) { throw "Apply mode requires $($pair[0])" }
        }
        Assert-DirectChild -Child $RuntimeRoot -Parent $ReleaseBase -Label 'RuntimeRoot'
        $effectiveReleaseBase = [System.IO.Path]::GetFullPath($ReleaseBase)
        $effectiveRuntimeRoot = [System.IO.Path]::GetFullPath($RuntimeRoot)
        $effectiveServiceRoot = [System.IO.Path]::GetFullPath($ServiceRoot)
        $effectiveLogRoot = [System.IO.Path]::GetFullPath($LogRoot)
        $effectiveConfigFile = [System.IO.Path]::GetFullPath($ConfigFile)
        $effectiveDataRoot = [System.IO.Path]::GetFullPath($DataRoot)
        if (-not (Test-Path -LiteralPath $effectiveConfigFile -PathType Leaf)) { throw 'Service config file is missing' }
        if (((Get-Item -LiteralPath $effectiveConfigFile -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Service config file must not be a reparse point' }
    }

    $wrapperPath = Join-Path $effectiveServiceRoot 'PublicOpinionApi.exe'
    Assert-DistinctFilePath -Source $resolvedWinSWSource -Destination $wrapperPath -Label 'PublicOpinionApi wrapper target'

    New-Item -ItemType Directory -Path $effectiveReleaseBase, $effectiveServiceRoot, $effectiveLogRoot, $effectiveDataRoot -Force | Out-Null
    & (Join-Path $PSScriptRoot 'build-api-release.ps1') -SourceRoot $resolvedAppRoot -RuntimeRoot $effectiveRuntimeRoot
    $releaseCreated = $true
    New-Item -ItemType Directory -Path (Join-Path $effectiveLogRoot 'PublicOpinionApi') -Force | Out-Null
    Copy-Item -LiteralPath $resolvedWinSWSource -Destination $wrapperPath -Force
    $createdServiceArtifacts += $wrapperPath

    & (Join-Path $PSScriptRoot 'render-config.ps1') -SourceRoot $resolvedAppRoot -RuntimeRoot $effectiveRuntimeRoot `
        -NodeExe $resolvedNodeExe -OutputDirectory $effectiveServiceRoot -LogRoot $effectiveLogRoot `
        -ConfigFile $effectiveConfigFile -DataRoot $effectiveDataRoot -ServiceName PublicOpinionApi
    $createdServiceArtifacts += (Join-Path $effectiveServiceRoot 'PublicOpinionApi.xml')

    $readOnly = [System.Security.AccessControl.FileSystemRights]::ReadAndExecute
    $writable = [System.Security.AccessControl.FileSystemRights]::Modify
    Set-StrictTreeAcl -Path $effectiveRuntimeRoot -LocalServiceRights $readOnly
    Set-StrictItemAcl -Path $effectiveServiceRoot -LocalServiceRights $readOnly
    foreach ($artifact in $createdServiceArtifacts) { Set-StrictItemAcl -Path $artifact -LocalServiceRights $readOnly }
    Set-StrictItemAcl -Path (Split-Path -Parent $effectiveConfigFile) -LocalServiceRights $readOnly
    Set-StrictItemAcl -Path $effectiveConfigFile -LocalServiceRights $readOnly
    Set-StrictItemAcl -Path $effectiveLogRoot -LocalServiceRights $writable
    Set-StrictTreeAcl -Path (Join-Path $effectiveLogRoot 'PublicOpinionApi') -LocalServiceRights $writable
    Set-StrictTreeAcl -Path $effectiveDataRoot -LocalServiceRights $writable

    $validationArgs = @{
        DeploymentRoot = $effectiveServiceRoot; ReleaseRoot = $effectiveRuntimeRoot; SourceRoot = $resolvedAppRoot
        ConfigFile = $effectiveConfigFile; DataRoot = $effectiveDataRoot; LogRoot = $effectiveLogRoot
        TargetService = 'PublicOpinionApi'
    }
    if ($Mode -eq 'Preflight') { $validationArgs.Preflight = $true }
    & (Join-Path $PSScriptRoot 'validate-artifacts.ps1') @validationArgs
    if ($Mode -eq 'Preflight') { Write-Output 'PASS: isolated API release preflight matched the apply preparation path without SCM or production ProgramData access' }
} catch {
    if ($Mode -eq 'Apply') {
        foreach ($artifact in $createdServiceArtifacts) { if (Test-Path -LiteralPath $artifact) { Remove-Item -LiteralPath $artifact -Force } }
        if ($releaseCreated -and (Test-Path -LiteralPath $effectiveRuntimeRoot)) {
            & (Join-Path $PSScriptRoot 'remove-api-release.ps1') -ReleaseRoot $effectiveRuntimeRoot -ReleaseBase $effectiveReleaseBase
        }
    }
    throw
} finally {
    if ($Mode -eq 'Preflight' -and $preflightRoot -and [System.IO.Directory]::Exists($preflightRoot)) {
        $resolvedPreflightRoot = (Resolve-Path -LiteralPath $preflightRoot).Path
        $resolvedTempRoot = (Resolve-Path -LiteralPath (Join-Path $resolvedAppRoot '.temp')).Path.TrimEnd('\')
        if (-not $resolvedPreflightRoot.StartsWith("$resolvedTempRoot\", [System.StringComparison]::OrdinalIgnoreCase)) { throw "Refusing preflight cleanup outside project .temp: $resolvedPreflightRoot" }
        & node.exe -e "require('node:fs').rmSync(process.argv[1], { recursive: true, force: true, maxRetries: 3 })" $resolvedPreflightRoot
        if ($LASTEXITCODE -ne 0) { throw "Preflight cleanup failed with exit code $LASTEXITCODE" }
    }
}
