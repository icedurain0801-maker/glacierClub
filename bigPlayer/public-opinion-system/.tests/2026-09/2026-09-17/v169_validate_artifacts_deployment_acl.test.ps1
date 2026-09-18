$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$tempRoot = Join-Path $projectRoot '.temp'
$fixtureRoot = Join-Path $tempRoot ("v169-{0}" -f [guid]::NewGuid().ToString('N').Substring(0, 8))
$serviceRoot = Join-Path $fixtureRoot 'services'
$releaseBase = Join-Path $fixtureRoot 'releases'
$releaseRoot = Join-Path $releaseBase 'release-test'
$logRoot = Join-Path $fixtureRoot 'logs'
$apiLogRoot = Join-Path $logRoot 'PublicOpinionApi'
$configRoot = Join-Path $fixtureRoot 'config'
$configFile = Join-Path $configRoot 'public-opinion.env'
$dataRoot = Join-Path $fixtureRoot 'data'
$validator = Join-Path $projectRoot 'scripts\windows-services\validate-artifacts.ps1'
$renderer = Join-Path $projectRoot 'scripts\windows-services\render-config.ps1'
$releaseBuilder = Join-Path $projectRoot 'scripts\windows-services\build-api-release.ps1'
$probeExecutable = Join-Path $env:SystemRoot 'System32\where.exe'
$apiExecutable = Join-Path $serviceRoot 'PublicOpinionApi.exe'
$apiConfig = Join-Path $serviceRoot 'PublicOpinionApi.xml'
$probePattern = 'winsw-render-validation-*'

function Get-AccessSddl([System.IO.FileSystemInfo]$Item) {
    return (Get-Acl -LiteralPath $Item.FullName).GetSecurityDescriptorSddlForm(
        [System.Security.AccessControl.AccessControlSections]::Access
    )
}

function Enable-AccessControlCompatibility {
    $item = Get-Item -LiteralPath $PSScriptRoot -Force
    if ($item.PSObject.Methods.Name -contains 'GetAccessControl') { return }
    Update-TypeData -TypeName System.IO.FileSystemInfo -MemberType ScriptMethod -MemberName GetAccessControl -Value {
        param($sections)
        Get-Acl -LiteralPath $this.FullName
    } -Force
}

function Set-StrictFixtureAcl([System.IO.FileSystemInfo]$Item, [System.Security.AccessControl.FileSystemRights]$LocalServiceRights) {
    $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $isDirectory = $Item -is [System.IO.DirectoryInfo]
    $security = if ($isDirectory) { New-Object System.Security.AccessControl.DirectorySecurity } else { New-Object System.Security.AccessControl.FileSecurity }
    $security.SetAccessRuleProtection($true, $false)
    $inheritance = if ($isDirectory) { [System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit' } else { [System.Security.AccessControl.InheritanceFlags]::None }
    $propagation = [System.Security.AccessControl.PropagationFlags]::None
    foreach ($sid in @(
        [System.Security.Principal.SecurityIdentifier]'S-1-5-18',
        [System.Security.Principal.SecurityIdentifier]'S-1-5-32-544'
    )) {
        $security.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
            $sid,
            [System.Security.AccessControl.FileSystemRights]::FullControl,
            $inheritance,
            $propagation,
            [System.Security.AccessControl.AccessControlType]::Allow
        )))
    }
    foreach ($entry in @(
        @($currentSid, [System.Security.AccessControl.FileSystemRights]::ReadAndExecute),
        @([System.Security.Principal.SecurityIdentifier]'S-1-5-19', $LocalServiceRights)
    )) {
        $security.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
            $entry[0],
            $entry[1],
            $inheritance,
            $propagation,
            [System.Security.AccessControl.AccessControlType]::Allow
        )))
    }
    try { Set-Acl -LiteralPath $Item.FullName -AclObject $security }
    catch { throw "Fixture ACL setup failed for $($Item.FullName): $($_.Exception.Message)" }
}

function Set-StrictFixtureTreeAcl([string]$Path, [System.Security.AccessControl.FileSystemRights]$LocalServiceRights) {
    foreach ($item in @(Get-Item -LiteralPath $Path -Force) + @(Get-ChildItem -LiteralPath $Path -Force -Recurse)) {
        Set-StrictFixtureAcl -Item $item -LocalServiceRights $LocalServiceRights
    }
}

Enable-AccessControlCompatibility

$beforeProbes = @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter $probePattern -ErrorAction SilentlyContinue).Name
try {
    New-Item -ItemType Directory -Path $serviceRoot, $apiLogRoot, $configRoot, $dataRoot -Force | Out-Null
    Set-Content -LiteralPath $configFile -Value "PORT=4320`n" -Encoding UTF8
    & $releaseBuilder -SourceRoot $projectRoot -RuntimeRoot $releaseRoot
    if ($LASTEXITCODE -ne 0) { throw 'release fixture build failed' }
    Copy-Item -LiteralPath $probeExecutable -Destination $apiExecutable
    & $renderer -SourceRoot $projectRoot -RuntimeRoot $releaseRoot -NodeExe $probeExecutable -OutputDirectory $serviceRoot -LogRoot $logRoot -ConfigFile $configFile -DataRoot $dataRoot -ServiceName PublicOpinionApi

    $apiExecutableItem = Get-Item -LiteralPath $apiExecutable
    $apiConfigItem = Get-Item -LiteralPath $apiConfig
    $readOnly = [System.Security.AccessControl.FileSystemRights]::ReadAndExecute
    $writable = [System.Security.AccessControl.FileSystemRights]::Modify
    Set-StrictFixtureTreeAcl -Path $releaseRoot -LocalServiceRights $readOnly
    Set-StrictFixtureTreeAcl -Path $serviceRoot -LocalServiceRights $readOnly
    Set-StrictFixtureTreeAcl -Path $configRoot -LocalServiceRights $readOnly
    Set-StrictFixtureTreeAcl -Path $logRoot -LocalServiceRights $writable
    Set-StrictFixtureTreeAcl -Path $dataRoot -LocalServiceRights $writable

    $baseline = @{}
    foreach ($item in @($apiExecutableItem, $apiConfigItem)) {
        $baseline[$item.FullName] = [pscustomobject]@{
            Hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $item.FullName).Hash
            LastWriteTimeUtc = $item.LastWriteTimeUtc
            AccessSddl = Get-AccessSddl $item
        }
    }

    $validationArguments = @{
        DeploymentRoot = $serviceRoot; ReleaseRoot = $releaseRoot; SourceRoot = $projectRoot
        ConfigFile = $configFile; DataRoot = $dataRoot; LogRoot = $logRoot; Preflight = $true; TargetService = 'PublicOpinionApi'
    }
    & $validator @validationArguments
    & $validator @validationArguments

    foreach ($path in $baseline.Keys) {
        $item = Get-Item -LiteralPath $path
        if ((Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash -ne $baseline[$path].Hash) { throw "Validator changed hash: $path" }
        if ($item.LastWriteTimeUtc -ne $baseline[$path].LastWriteTimeUtc) { throw "Validator changed mtime: $path" }
        if ((Get-AccessSddl $item) -ne $baseline[$path].AccessSddl) { throw "Validator changed ACL: $path" }
    }

    $unauthorizedSid = [System.Security.Principal.SecurityIdentifier]'S-1-5-32-545'
    $negativeItem = Get-Item -LiteralPath $apiConfig
    try {
        $negativeAcl = Get-Acl -LiteralPath $negativeItem.FullName
        $negativeAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
            $unauthorizedSid,
            [System.Security.AccessControl.FileSystemRights]::Read,
            [System.Security.AccessControl.AccessControlType]::Allow
        )))
        Set-Acl -LiteralPath $negativeItem.FullName -AclObject $negativeAcl

        $rejected = $false
        try {
            & $validator @validationArguments *> $null
        } catch {
            if ($_.Exception.Message -notmatch 'Unauthorized allow ACE') { throw }
            $rejected = $true
        }
        if (-not $rejected) { throw 'Unauthorized Allow ACE was not rejected' }
    } finally {
        $restoredAcl = New-Object System.Security.AccessControl.FileSecurity
        $restoredAcl.SetSecurityDescriptorSddlForm(
            $baseline[$negativeItem.FullName].AccessSddl,
            [System.Security.AccessControl.AccessControlSections]::Access
        )
        Set-Acl -LiteralPath $negativeItem.FullName -AclObject $restoredAcl
    }

    foreach ($path in $baseline.Keys) {
        $item = Get-Item -LiteralPath $path
        if ((Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash -ne $baseline[$path].Hash) { throw "Negative test changed hash: $path" }
        if ($item.LastWriteTimeUtc -ne $baseline[$path].LastWriteTimeUtc) { throw "Negative test changed mtime: $path" }
        if ((Get-AccessSddl $item) -ne $baseline[$path].AccessSddl) { throw "Negative test did not restore ACL: $path" }
    }
} finally {
    if ([System.IO.Directory]::Exists($fixtureRoot)) {
        $resolvedFixture = (Resolve-Path -LiteralPath $fixtureRoot).Path
        $resolvedTempRoot = (Resolve-Path -LiteralPath $tempRoot).Path.TrimEnd('\')
        if (-not $resolvedFixture.StartsWith("$resolvedTempRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing fixture cleanup outside project .temp: $resolvedFixture"
        }
        & node.exe -e "require('node:fs').rmSync(process.argv[1], { recursive: true, force: true, maxRetries: 3 })" $resolvedFixture
        if ($LASTEXITCODE -ne 0) { throw 'fixture cleanup failed' }
    }
}

$afterProbes = @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter $probePattern -ErrorAction SilentlyContinue).Name
$newProbes = @($afterProbes | Where-Object { $_ -notin $beforeProbes })
if ($newProbes.Count -ne 0) { throw "Render probe cleanup failed: $($newProbes -join ', ')" }
if (Test-Path -LiteralPath $fixtureRoot) { throw "Fixture cleanup failed: $fixtureRoot" }

Write-Output 'PASS: API deployment ACL path is reentrant, rejects unauthorized Allow ACEs, and leaves no persistent fixture changes'
