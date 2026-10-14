$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$tempRoot = Join-Path $projectRoot '.temp'
$fixtureRoot = Join-Path $tempRoot ("winsw-account-contract-{0}" -f [guid]::NewGuid().ToString('N'))
$positiveRoot = Join-Path $fixtureRoot 'positive'
$negativeRoot = Join-Path $fixtureRoot 'negative'
$logRoot = Join-Path $fixtureRoot 'logs'
$validator = Join-Path $projectRoot 'scripts\windows-services\validate-artifacts.ps1'
$renderer = Join-Path $projectRoot 'scripts\windows-services\render-config.ps1'
$probeExecutable = Join-Path $env:SystemRoot 'System32\where.exe'
$failedDeployment = Join-Path $projectRoot '.temp\windows-services-stage-b1\failed-deploy-8'
$probePattern = 'winsw-render-validation-*'

function Get-AccessSddl([System.IO.FileInfo]$Item) {
    return $Item.GetAccessControl(
        [System.Security.AccessControl.AccessControlSections]::Access
    ).GetSecurityDescriptorSddlForm(
        [System.Security.AccessControl.AccessControlSections]::Access
    )
}

function Set-StrictFixtureAcl([System.IO.FileInfo]$Item) {
    $security = New-Object System.Security.AccessControl.FileSecurity
    $security.SetAccessRuleProtection($true, $false)
    foreach ($sid in @(
        [System.Security.Principal.SecurityIdentifier]'S-1-5-18',
        [System.Security.Principal.SecurityIdentifier]'S-1-5-32-544'
    )) {
        $security.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
            $sid,
            [System.Security.AccessControl.FileSystemRights]::FullControl,
            [System.Security.AccessControl.AccessControlType]::Allow
        )))
    }
    foreach ($sid in @(
        [System.Security.Principal.WindowsIdentity]::GetCurrent().User,
        [System.Security.Principal.SecurityIdentifier]'S-1-5-19'
    )) {
        $security.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
            $sid,
            [System.Security.AccessControl.FileSystemRights]::ReadAndExecute,
            [System.Security.AccessControl.AccessControlType]::Allow
        )))
    }
    $Item.SetAccessControl($security)
}

function Get-FileSnapshot([string[]]$Paths) {
    $snapshot = @{}
    foreach ($path in $Paths) {
        $item = Get-Item -LiteralPath $path
        $snapshot[$item.FullName] = [pscustomobject]@{
            Hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $item.FullName).Hash
            LastWriteTimeUtc = $item.LastWriteTimeUtc
            AccessSddl = Get-AccessSddl $item
        }
    }
    return $snapshot
}

function Assert-SnapshotUnchanged([hashtable]$Snapshot) {
    foreach ($path in $Snapshot.Keys) {
        $item = Get-Item -LiteralPath $path
        if ((Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash -ne $Snapshot[$path].Hash) { throw "Hash changed: $path" }
        if ($item.LastWriteTimeUtc -ne $Snapshot[$path].LastWriteTimeUtc) { throw "Mtime changed: $path" }
        if ((Get-AccessSddl $item) -ne $Snapshot[$path].AccessSddl) { throw "ACL changed: $path" }
    }
}

function Assert-ValidationFails([string]$DeploymentRoot, [string]$ExpectedMessage) {
    $failed = $false
    try {
        & $validator -DeploymentRoot $DeploymentRoot -TargetService PublicOpinionApi *> $null
    } catch {
        if ($_.Exception.Message -notmatch $ExpectedMessage) { throw }
        $failed = $true
    }
    if (-not $failed) { throw "Expected validation failure matching: $ExpectedMessage" }
}

$beforeProbes = @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter $probePattern -ErrorAction SilentlyContinue).Name
try {
    New-Item -ItemType Directory -Path $positiveRoot, $negativeRoot, $logRoot -Force | Out-Null

    foreach ($serviceName in @('PublicOpinionApi', 'PublicOpinionWorker')) {
        Copy-Item -LiteralPath $probeExecutable -Destination (Join-Path $positiveRoot "$serviceName.exe")
    }
    & $renderer -AppRoot $projectRoot -NodeExe $probeExecutable -OutputDirectory $positiveRoot -LogRoot $logRoot -ServiceName All
    $positiveFiles = @(
        Join-Path $positiveRoot 'PublicOpinionApi.exe'
        Join-Path $positiveRoot 'PublicOpinionApi.xml'
        Join-Path $positiveRoot 'PublicOpinionWorker.exe'
        Join-Path $positiveRoot 'PublicOpinionWorker.xml'
    )
    foreach ($path in $positiveFiles) { Set-StrictFixtureAcl (Get-Item -LiteralPath $path) }
    $positiveSnapshot = Get-FileSnapshot $positiveFiles
    & $validator -DeploymentRoot $positiveRoot -TargetService All
    & $validator -DeploymentRoot $positiveRoot -TargetService All
    Assert-SnapshotUnchanged $positiveSnapshot

    $oldExe = Join-Path $failedDeployment 'PublicOpinionApi.exe'
    $oldXml = Join-Path $failedDeployment 'PublicOpinionApi.xml'
    if (-not (Test-Path -LiteralPath $oldExe -PathType Leaf) -or -not (Test-Path -LiteralPath $oldXml -PathType Leaf)) {
        throw 'Failed-deploy-8 API evidence is missing'
    }
    Copy-Item -LiteralPath $oldExe -Destination (Join-Path $negativeRoot 'PublicOpinionApi.exe')
    Copy-Item -LiteralPath $oldXml -Destination (Join-Path $negativeRoot 'PublicOpinionApi.xml')
    foreach ($path in @(Join-Path $negativeRoot 'PublicOpinionApi.exe'; Join-Path $negativeRoot 'PublicOpinionApi.xml')) {
        Set-StrictFixtureAcl (Get-Item -LiteralPath $path)
    }
    [xml]$oldConfig = Get-Content -LiteralPath (Join-Path $negativeRoot 'PublicOpinionApi.xml') -Raw
    if (-not $oldConfig.service.serviceaccount.username) { throw 'Failed-deploy-8 fixture does not contain the legacy username node' }
    $oldSnapshot = Get-FileSnapshot @(Join-Path $negativeRoot 'PublicOpinionApi.exe'; Join-Path $negativeRoot 'PublicOpinionApi.xml')
    Assert-ValidationFails -DeploymentRoot $negativeRoot -ExpectedMessage 'only domain and user|Forbidden service account node'
    Assert-SnapshotUnchanged $oldSnapshot

    $freshApi = Get-Content -LiteralPath (Join-Path $positiveRoot 'PublicOpinionApi.xml') -Raw
    foreach ($case in @('LocalSystem', 'MissingUser', 'UnknownNode')) {
        [xml]$caseConfig = $freshApi
        switch ($case) {
            'LocalSystem' { $caseConfig.service.serviceaccount.user = 'LocalSystem' }
            'MissingUser' {
                $userNode = $caseConfig.service.serviceaccount.SelectSingleNode('user')
                [void]$caseConfig.service.serviceaccount.RemoveChild($userNode)
            }
            'UnknownNode' {
                $unknown = $caseConfig.CreateElement('allowservicelogon')
                $unknown.InnerText = 'true'
                [void]$caseConfig.service.serviceaccount.AppendChild($unknown)
            }
        }
        $caseConfig.Save((Join-Path $negativeRoot 'PublicOpinionApi.xml'))
        Set-StrictFixtureAcl (Get-Item -LiteralPath (Join-Path $negativeRoot 'PublicOpinionApi.xml'))
        Assert-ValidationFails -DeploymentRoot $negativeRoot -ExpectedMessage 'only domain and user|must be NT AUTHORITY\\LocalService|Forbidden service account node'
    }
} finally {
    if ([System.IO.Directory]::Exists($fixtureRoot)) {
        $resolvedFixture = (Resolve-Path -LiteralPath $fixtureRoot).Path
        $resolvedTempRoot = (Resolve-Path -LiteralPath $tempRoot).Path.TrimEnd('\')
        if (-not $resolvedFixture.StartsWith("$resolvedTempRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing fixture cleanup outside project .temp: $resolvedFixture"
        }
        [System.IO.Directory]::Delete($resolvedFixture, $true)
    }
}

$afterProbes = @(Get-ChildItem -LiteralPath $tempRoot -Directory -Filter $probePattern -ErrorAction SilentlyContinue).Name
$newProbes = @($afterProbes | Where-Object { $_ -notin $beforeProbes })
if ($newProbes.Count -ne 0) { throw "Render probe cleanup failed: $($newProbes -join ', ')" }
if (Test-Path -LiteralPath $fixtureRoot) { throw "Fixture cleanup failed: $fixtureRoot" }

Write-Output 'PASS: WinSW domain/user service-account contract accepts new API/Worker XML, rejects legacy and unsafe variants, and leaves no persistent fixture changes'
