param(
    [string]$DeploymentRoot,
    [string]$ReleaseRoot,
    [string]$SourceRoot,
    [string]$ConfigFile,
    [string]$DataRoot,
    [string]$LogRoot,
    [switch]$Preflight,
    [ValidateSet('PublicOpinionApi', 'PublicOpinionWorker', 'All')][string]$TargetService = 'All'
)

$ErrorActionPreference = 'Stop'
$serviceNames = @('PublicOpinionApi', 'PublicOpinionWorker')

function Assert-ServiceAccountContract([System.Xml.XmlElement]$ServiceAccount, [string]$Context) {
    if (-not $ServiceAccount) { throw "Service account missing for $Context" }
    $elementNames = @($ServiceAccount.ChildNodes | Where-Object { $_ -is [System.Xml.XmlElement] } | ForEach-Object { $_.Name })
    if ($elementNames.Count -ne 2 -or 'domain' -notin $elementNames -or 'user' -notin $elementNames) {
        throw "Service account must contain only domain and user for $Context"
    }
    if ([string]$ServiceAccount.domain -ne 'NT AUTHORITY' -or [string]$ServiceAccount.user -ne 'LocalService') {
        throw "Service account must be NT AUTHORITY\LocalService for $Context"
    }
    if ($ServiceAccount.username -or $ServiceAccount.password -or $ServiceAccount.allowservicelogon) {
        throw "Forbidden service account node for $Context"
    }
}

foreach ($serviceName in $serviceNames) {
    [xml]$config = Get-Content -LiteralPath (Join-Path $PSScriptRoot "$serviceName.xml") -Raw
    if ($config.service.id -ne $serviceName) { throw 'Service id mismatch' }
    if ($config.service.arguments -notmatch '^".*"$') { throw 'Entry path must be quoted' }
    Assert-ServiceAccountContract -ServiceAccount $config.service.serviceaccount -Context "$serviceName template"
    if ($config.service.stoptimeout -ne '60 sec') { throw 'Graceful stop timeout missing' }
    if (($config.service.onfailure.delay -join ',') -ne '5 sec,30 sec,60 sec') { throw 'Failure recovery mismatch' }
    if ($config.service.logpath -ne "%SERVICE_LOG_ROOT%\$serviceName") { throw "Dedicated log path missing for $serviceName" }
    if ($serviceName -eq 'PublicOpinionWorker') {
        if (-not ($config.service.env | Where-Object { $_.name -eq 'UNIFIED_SOURCE_SCHEDULER_MODE' -and $_.value -eq 'enabled' })) { throw 'Scheduler mode missing' }
        if (-not ($config.service.env | Where-Object { $_.name -eq 'WORKER_INTERVAL_MS' -and $_.value -eq '60000' })) { throw 'Worker interval mismatch' }
        foreach ($name in @('PUBLIC_OPINION_SERVICE_MODE','PUBLIC_OPINION_ENV_FILE','Q1_DAILY_OUT_ROOT','Q1_DAILY_LOCK_ROOT','WORKER_STATE_ROOT','NODE_PATH','NODE_OPTIONS')) { if (-not ($config.service.env | Where-Object { $_.name -eq $name })) { throw "Worker environment missing: $name" } }
    }
    if ($serviceName -eq 'PublicOpinionApi') {
        $expected = @{
            PUBLIC_OPINION_SERVICE_MODE = '1'
            PUBLIC_OPINION_ENV_FILE = '%PUBLIC_OPINION_ENV_FILE%'
            Q1_DAILY_OUT_ROOT = '%Q1_DAILY_OUT_ROOT%'
            NODE_PATH = ''
            NODE_OPTIONS = ''
        }
        foreach ($name in $expected.Keys) {
            $matches = @($config.service.env | Where-Object { $_.name -eq $name -and [string]$_.value -eq $expected[$name] })
            if ($matches.Count -ne 1) { throw "API service environment mismatch for $name" }
        }
    }
}

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$tempRoot = Join-Path $projectRoot '.temp'
$renderProbe = Join-Path $tempRoot ("winsw-render-validation-{0}" -f [guid]::NewGuid().ToString('N'))
$renderOutput = Join-Path $renderProbe 'services'
$renderLogs = Join-Path $renderProbe 'logs'
$renderConfig = Join-Path $renderProbe 'config\public-opinion.env'
$renderData = Join-Path $renderProbe 'data'
$probeExecutable = Join-Path $env:SystemRoot 'System32\where.exe'
$probeRuntime = 'C:\ProgramData\PublicOpinion\app\current'
$probeWorkerBuildSha = 'A' * 64
function Test-AbsoluteWindowsPath([string]$Path) {
    return [System.IO.Path]::IsPathRooted($Path) -and $Path -match '^(?:[A-Za-z]:\\|\\\\)'
}
function Get-Sha256File([string]$Path) {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        try { return [System.BitConverter]::ToString($sha256.ComputeHash($stream)).Replace('-', '') }
        finally { $sha256.Dispose() }
    } finally { $stream.Dispose() }
}
try {
    New-Item -ItemType Directory -Path $renderOutput -Force | Out-Null
    New-Item -ItemType Directory -Path $renderLogs, (Split-Path -Parent $renderConfig), $renderData -Force | Out-Null
    Set-Content -LiteralPath $renderConfig -Value "PORT=4320`n" -Encoding UTF8
    & (Join-Path $PSScriptRoot 'render-config.ps1') -SourceRoot $projectRoot -RuntimeRoot $probeRuntime -NodeExe $probeExecutable -OutputDirectory $renderOutput -LogRoot $renderLogs -ConfigFile $renderConfig -DataRoot $renderData -WorkerBuildSha $probeWorkerBuildSha
    foreach ($serviceName in $serviceNames) {
        $renderedPath = Join-Path $renderOutput "$serviceName.xml"
        if (-not (Test-Path -LiteralPath $renderedPath -PathType Leaf)) { throw "Rendered XML missing for $serviceName" }
        [xml]$rendered = Get-Content -LiteralPath $renderedPath -Raw
        $entry = if ($serviceName -eq 'PublicOpinionApi') { 'server\src\app.js' } else { 'worker\src\worker.js' }
        $expectedEntry = [string](Join-Path $probeRuntime $entry)
        $expectedWorkingDirectory = [string](Split-Path -Parent (Split-Path -Parent $expectedEntry))
        $expectedLogPath = [string](Join-Path $renderLogs $serviceName)
        if (-not (Test-AbsoluteWindowsPath ([string]$rendered.service.executable))) { throw "Rendered executable is not absolute for $serviceName" }
        if ([string]$rendered.service.executable -ne [string](Resolve-Path -LiteralPath $probeExecutable).Path) { throw "Rendered executable mismatch for $serviceName" }
        if ([string]$rendered.service.arguments -ne ('"' + $expectedEntry + '"')) { throw "Rendered arguments mismatch for $serviceName" }
        if (-not (Test-AbsoluteWindowsPath $expectedEntry)) { throw "Rendered entry is not absolute for $serviceName" }
        if ([string]$rendered.service.workingdirectory -ne $expectedWorkingDirectory) { throw "Rendered workingdirectory mismatch for $serviceName" }
        if (-not (Test-AbsoluteWindowsPath ([string]$rendered.service.workingdirectory))) { throw "Rendered workingdirectory is not absolute for $serviceName" }
        if ([string]$rendered.service.logpath -ne $expectedLogPath) { throw "Rendered logpath mismatch for $serviceName" }
        if (-not (Test-AbsoluteWindowsPath ([string]$rendered.service.logpath))) { throw "Rendered logpath is not absolute for $serviceName" }
        Assert-ServiceAccountContract -ServiceAccount $rendered.service.serviceaccount -Context "$serviceName rendered XML"
        $environment = @{}
        foreach ($envNode in @($rendered.service.env)) {
            if (-not $envNode) { continue }
            $name = [string]$envNode.name
            $value = [string]$envNode.value
            if ([string]::IsNullOrWhiteSpace($name)) { throw "Rendered environment name is empty for $serviceName" }
            if ($environment.ContainsKey($name)) { throw "Duplicate rendered environment variable $name for $serviceName" }
            $environment[$name] = $value
        }
        if ($serviceName -eq 'PublicOpinionApi') {
            $expectedEnvironment = @{
                PUBLIC_OPINION_SERVICE_MODE = '1'
                PUBLIC_OPINION_ENV_FILE = $renderConfig
                Q1_DAILY_OUT_ROOT = $renderData
                NODE_PATH = ''
                NODE_OPTIONS = ''
            }
            if ($environment.Count -ne $expectedEnvironment.Count) { throw 'API rendered environment count mismatch' }
            foreach ($name in $expectedEnvironment.Keys) {
                if ([string]$environment[$name] -ne [string]$expectedEnvironment[$name]) { throw "API rendered environment mismatch for $name" }
            }
        }
        if ($serviceName -eq 'PublicOpinionWorker') {
            $expectedEnvironment = @{
                WORKER_MODE = 'enabled'
                BUILD_SHA = $probeWorkerBuildSha
                UNIFIED_SOURCE_SCHEDULER_MODE = 'enabled'
                WORKER_INTERVAL_MS = '60000'
                PUBLIC_OPINION_SERVICE_MODE = '1'
                PUBLIC_OPINION_ENV_FILE = $renderConfig
                Q1_DAILY_OUT_ROOT = $renderData
                Q1_DAILY_LOCK_ROOT = (Join-Path $renderData 'locks')
                WORKER_STATE_ROOT = (Join-Path $renderData 'state')
                NODE_PATH = ''
                NODE_OPTIONS = ''
            }
            if ($environment.Count -ne $expectedEnvironment.Count) { throw 'Worker rendered environment count mismatch' }
            foreach ($name in $expectedEnvironment.Keys) {
                if ([string]$environment[$name] -ne [string]$expectedEnvironment[$name]) { throw "Worker rendered environment mismatch for $name" }
            }
        }
        $renderedRaw = Get-Content -LiteralPath $renderedPath -Raw
        if ($renderedRaw -match '%[A-Za-z_][A-Za-z0-9_]*%') { throw "Unresolved placeholder remains in rendered XML for $serviceName" }
        if ($renderedRaw -match '(?i)<(?:password|secret|token|api[-_]?key)>') { throw "Sensitive value element is forbidden in rendered XML for $serviceName" }
    }
} finally {
    if ([System.IO.Directory]::Exists($renderProbe)) {
        $resolvedProbe = (Resolve-Path -LiteralPath $renderProbe).Path
        $resolvedTempRoot = (Resolve-Path -LiteralPath $tempRoot).Path.TrimEnd('\')
        if (-not $resolvedProbe.StartsWith("$resolvedTempRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing render probe cleanup outside project .temp: $resolvedProbe"
        }
        [System.IO.Directory]::Delete($resolvedProbe, $true)
    }
}

if ($ReleaseRoot) {
    $resolvedReleaseRoot = (Resolve-Path -LiteralPath $ReleaseRoot).Path
    $effectiveSourceRoot = if ($SourceRoot) { (Resolve-Path -LiteralPath $SourceRoot).Path } else { $projectRoot }
    $verifier = if ($TargetService -eq 'PublicOpinionWorker') { 'verify-worker-release.js' } else { 'verify-api-release.js' }
    & node.exe (Join-Path $PSScriptRoot $verifier) $resolvedReleaseRoot $effectiveSourceRoot
    if ($LASTEXITCODE -ne 0) { throw "Release verification failed with exit code $LASTEXITCODE" }
}

$installScriptContent = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'install-services.cmd') -Raw
foreach ($serviceName in $serviceNames) {
    if ($installScriptContent -notmatch [regex]::Escape("%SERVICE_ROOT%\%%S.exe")) { throw 'Same-name wrapper deployment missing' }
}
if ($installScriptContent -notmatch '(?im)^\s*"%SERVICE_ROOT%\\%%S\.exe" install \|\| goto install_failure\s*$') { throw 'Same-name install command missing' }
if ($installScriptContent -match '(?i)winsw(?:\.exe)?"?\s+install\s+"[^\r\n]*\.xml') { throw 'Legacy WinSW install <xml> invocation remains' }
if ($installScriptContent -notmatch '(?i)/preflight') { throw 'Isolated preflight mode missing' }
if ($installScriptContent -notmatch '(?i)prepare-services\.ps1') { throw 'Shared apply/preflight preparation helper missing' }
if ($installScriptContent -match '(?is)for\s+/f[^\r\n]*Get-FileHash') { throw 'Fragile for /f hash command remains' }
if ($installScriptContent -notmatch '(?i)SERVICE_START_NAME') { throw 'Post-install SCM account query missing' }
if ($installScriptContent -notmatch '(?i)NTAUTHORITY\\LocalService') { throw 'Post-install LocalService assertion missing' }
if ($installScriptContent -notmatch '(?i)account-validation-') { throw 'Account mismatch evidence preservation missing' }

$prepareScriptContent = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'prepare-services.ps1') -Raw
if ($prepareScriptContent -notmatch '05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA') { throw 'Pinned WinSW v2.12.0 hash check missing' }
if ($prepareScriptContent -notmatch '(?i)System\.Security\.Cryptography\.SHA256') { throw 'WinSW SHA-256 implementation missing' }
if ($prepareScriptContent -notmatch '(?i)windows services preflight') { throw 'Preflight path with spaces missing' }
if ($prepareScriptContent -notmatch '(?is)-OutputDirectory\s+\$effectiveServiceRoot') { throw 'Rendered XML is not written beside wrappers' }
if ($prepareScriptContent -notmatch '(?i)validate-artifacts\.ps1') { throw 'Shared deployment validation missing from preparation helper' }
if ($prepareScriptContent -notmatch '(?i)Refusing preflight cleanup outside project \.temp') { throw 'Safe preflight cleanup guard missing' }

$rollbackScriptContent = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'rollback-services.cmd') -Raw
if ($rollbackScriptContent -notmatch '(?im)^\s*"%SERVICE_ROOT%\\%%S\.exe" uninstall') { throw 'Rollback same-name uninstall command missing' }
if ($rollbackScriptContent -match '(?i)uninstall\s+"[^\r\n]*\.xml') { throw 'Rollback still passes XML to WinSW' }

$uninstallScriptContent = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'uninstall-services.cmd') -Raw
if ($uninstallScriptContent -notmatch '(?im)^\s*"%SERVICE_ROOT%\\%%S\.exe" uninstall') { throw 'Dedicated same-name uninstall command missing' }
if ($uninstallScriptContent -match '(?i)uninstall\s+"[^\r\n]*\.xml') { throw 'Uninstall still passes XML to WinSW' }

$statusScriptContent = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'status-services.cmd') -Raw
if ($statusScriptContent -notmatch '(?im)^\s*"%SERVICE_ROOT%\\%%S\.exe" status') { throw 'Same-name status command missing' }

$exportScript = Join-Path $PSScriptRoot 'export-legacy-tasks.cmd'
$exportScriptContent = Get-Content -LiteralPath $exportScript -Raw
if ($exportScriptContent -notmatch '(?im)^if "%~1"=="" goto :dry_run\s*$') { throw 'No-argument export must enter dry-run' }
if ($exportScriptContent -notmatch '(?im)^if /I not "%~1"=="/apply" goto :usage_error\s*$') { throw 'Export apply gate missing' }
if ($exportScriptContent -notmatch '(?im)^:usage_error\s*$') { throw 'Unknown argument rejection missing' }
$applyGateIndex = $exportScriptContent.IndexOf('if /I not "%~1"=="/apply" goto :usage_error')
$mkdirIndex = $exportScriptContent.IndexOf('mkdir "%OUT%"')
$schtasksIndex = $exportScriptContent.IndexOf('schtasks /Query')
$dryRunLabelIndex = $exportScriptContent.LastIndexOf(':dry_run')
if ($mkdirIndex -le $applyGateIndex -or $mkdirIndex -ge $dryRunLabelIndex) { throw 'Directory creation escaped the /apply branch' }
if ($schtasksIndex -le $applyGateIndex -or $schtasksIndex -ge $dryRunLabelIndex) { throw 'schtasks escaped the /apply branch' }
if ([regex]::Matches($exportScriptContent, '(?im)^\s*schtasks\s').Count -ne 1) { throw 'Unexpected schtasks invocation found' }

$defaultOutput = Join-Path $PSScriptRoot 'legacy-task-export'
$invalidOutput = Join-Path ([System.IO.Path]::GetTempPath()) ("public-opinion-invalid-export-{0}" -f [guid]::NewGuid())
if (Test-Path -LiteralPath $defaultOutput) { throw "Cannot prove default zero side effects because test target already exists: $defaultOutput" }

function Invoke-ExpectedArgumentFailure {
    param([string]$Script, [string[]]$Arguments)

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $Script @Arguments *> $null
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

& $exportScript *> $null
if ($LASTEXITCODE -ne 0) { throw 'No-argument dry-run must exit 0' }
if (Test-Path -LiteralPath $defaultOutput) { throw 'No-argument dry-run created an output directory' }

& $exportScript /dry-run *> $null
if ($LASTEXITCODE -ne 0) { throw '/dry-run must exit 0' }
if (Test-Path -LiteralPath $defaultOutput) { throw '/dry-run created an output directory' }

$argumentExitCode = Invoke-ExpectedArgumentFailure -Script $exportScript -Arguments @('/dry-run', $invalidOutput)
if ($argumentExitCode -ne 2) { throw "Malformed /dry-run arguments must return 2, got $argumentExitCode" }
if (Test-Path -LiteralPath $invalidOutput) { throw 'Malformed /dry-run arguments caused a filesystem side effect' }

$argumentExitCode = Invoke-ExpectedArgumentFailure -Script $exportScript -Arguments @('/unsupported', $invalidOutput)
if ($argumentExitCode -ne 2) { throw "Unknown export argument must return 2, got $argumentExitCode" }
if (Test-Path -LiteralPath $invalidOutput) { throw 'Unknown export argument caused a filesystem side effect' }

$argumentExitCode = Invoke-ExpectedArgumentFailure -Script $exportScript -Arguments @('/apply', $invalidOutput, 'unexpected')
if ($argumentExitCode -ne 2) { throw "Malformed /apply arguments must return 2, got $argumentExitCode" }
if (Test-Path -LiteralPath $invalidOutput) { throw 'Malformed /apply arguments caused a filesystem side effect' }

$probeRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("public-opinion-service-probe-{0}" -f [guid]::NewGuid())
$probeLogs = "$probeRoot-logs"
$previousServiceRoot = $env:SERVICE_ROOT
$previousLogRoot = $env:SERVICE_LOG_ROOT
try {
    $env:SERVICE_ROOT = $probeRoot
    $env:SERVICE_LOG_ROOT = $probeLogs
    foreach ($scriptName in @('install-services.cmd', 'uninstall-services.cmd', 'status-services.cmd', 'rollback-services.cmd')) {
        $scriptPath = Join-Path $PSScriptRoot $scriptName
        & $scriptPath *> $null
        if ($LASTEXITCODE -ne 0) { throw "$scriptName no-argument dry-run must exit 0" }
        if ((Test-Path -LiteralPath $probeRoot) -or (Test-Path -LiteralPath $probeLogs)) {
            throw "$scriptName no-argument dry-run caused a filesystem side effect"
        }
        $argumentExitCode = Invoke-ExpectedArgumentFailure -Script $scriptPath -Arguments @('/unsupported', 'unexpected')
        if ($argumentExitCode -ne 2) { throw "$scriptName malformed arguments must return 2, got $argumentExitCode" }
        if ((Test-Path -LiteralPath $probeRoot) -or (Test-Path -LiteralPath $probeLogs)) {
            throw "$scriptName malformed arguments caused a filesystem side effect"
        }
    }
} finally {
    $env:SERVICE_ROOT = $previousServiceRoot
    $env:SERVICE_LOG_ROOT = $previousLogRoot
}

function Assert-AllowedAcl {
    param(
        [Parameter(Mandatory)][string]$Path,
        [ValidateSet('ReadOnly', 'Writable')][string]$Profile = 'ReadOnly'
    )

    $item = Get-Item -LiteralPath $Path -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Reparse point is forbidden: $Path" }

    $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $allowedSids = @('S-1-5-18', 'S-1-5-19', 'S-1-5-32-544', $currentSid)
    $acl = $item.GetAccessControl([System.Security.AccessControl.AccessControlSections]::Access)
    foreach ($rule in $acl.Access) {
        if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) { continue }
        try {
            $sid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
        } catch {
            throw "Cannot resolve ACL identity $($rule.IdentityReference) on $Path"
        }
        if ($sid -notin $allowedSids) { throw "Unauthorized allow ACE $sid on $Path" }
    }

    function Get-AllowRights([string]$Sid) {
        $rights = [System.Security.AccessControl.FileSystemRights]0
        foreach ($rule in $acl.Access) {
            if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) { continue }
            try { $ruleSid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value } catch { continue }
            if ($ruleSid -eq $Sid) { $rights = $rights -bor $rule.FileSystemRights }
        }
        return $rights
    }

    $fullControl = [System.Security.AccessControl.FileSystemRights]::FullControl
    foreach ($sid in @('S-1-5-18', 'S-1-5-32-544')) {
        $rights = Get-AllowRights $sid
        if (($rights -band $fullControl) -ne $fullControl) { throw "FullControl missing for $sid on $Path" }
    }
    $operatorRights = Get-AllowRights $currentSid
    $readExecute = [System.Security.AccessControl.FileSystemRights]::ReadAndExecute
    if (($operatorRights -band $readExecute) -ne $readExecute) { throw "Operator ReadAndExecute missing on $Path" }

    $localServiceRights = Get-AllowRights 'S-1-5-19'
    $requiredLocalServiceRights = if ($Profile -eq 'Writable') { [System.Security.AccessControl.FileSystemRights]::Modify } else { $readExecute }
    if (($localServiceRights -band $requiredLocalServiceRights) -ne $requiredLocalServiceRights) { throw "LocalService $Profile rights missing on $Path" }
    $writeCapableRights = [System.Security.AccessControl.FileSystemRights]::Write `
        -bor [System.Security.AccessControl.FileSystemRights]::Delete `
        -bor [System.Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles `
        -bor [System.Security.AccessControl.FileSystemRights]::ChangePermissions `
        -bor [System.Security.AccessControl.FileSystemRights]::TakeOwnership
    if (($operatorRights -band $writeCapableRights) -ne 0) { throw "Operator write/modify/full-control access is forbidden on $Path" }
    if ($Profile -eq 'ReadOnly' -and ($localServiceRights -band $writeCapableRights) -ne 0) { throw "LocalService write/modify/full-control access is forbidden on $Path" }
    if ($Profile -eq 'Writable') {
        $privilegedRights = [System.Security.AccessControl.FileSystemRights]::ChangePermissions -bor [System.Security.AccessControl.FileSystemRights]::TakeOwnership
        if (($localServiceRights -band $privilegedRights) -ne 0) { throw "LocalService permission-management access is forbidden on $Path" }
    }
}

if ($DeploymentRoot) {
    foreach ($requiredValue in @(@('ReleaseRoot', $ReleaseRoot), @('ConfigFile', $ConfigFile), @('DataRoot', $DataRoot), @('LogRoot', $LogRoot))) {
        if ([string]::IsNullOrWhiteSpace([string]$requiredValue[1])) { throw "Deployment validation requires $($requiredValue[0])" }
    }
    $resolvedDeploymentRoot = (Resolve-Path -LiteralPath $DeploymentRoot).Path.TrimEnd('\')
    $resolvedReleaseRoot = (Resolve-Path -LiteralPath $ReleaseRoot).Path.TrimEnd('\')
    $resolvedConfigFile = (Resolve-Path -LiteralPath $ConfigFile).Path
    $resolvedDataRoot = (Resolve-Path -LiteralPath $DataRoot).Path.TrimEnd('\')
    $resolvedLogRoot = (Resolve-Path -LiteralPath $LogRoot).Path.TrimEnd('\')
    $effectiveSourceRoot = if ($SourceRoot) { (Resolve-Path -LiteralPath $SourceRoot).Path.TrimEnd('\') } else { $projectRoot.TrimEnd('\') }
    foreach ($item in @(Get-Item -LiteralPath $resolvedReleaseRoot -Force) + @(Get-ChildItem -LiteralPath $resolvedReleaseRoot -Force -Recurse)) { Assert-AllowedAcl -Path $item.FullName -Profile ReadOnly }
    Assert-AllowedAcl -Path $resolvedDeploymentRoot -Profile ReadOnly
    Assert-AllowedAcl -Path (Split-Path -Parent $resolvedConfigFile) -Profile ReadOnly
    Assert-AllowedAcl -Path $resolvedConfigFile -Profile ReadOnly
    Assert-AllowedAcl -Path $resolvedLogRoot -Profile Writable
    foreach ($serviceName in $(if ($TargetService -eq 'All') { $serviceNames } else { @($TargetService) })) {
        $serviceLogRoot = Join-Path $resolvedLogRoot $serviceName
        foreach ($item in @(Get-Item -LiteralPath $serviceLogRoot -Force) + @(Get-ChildItem -LiteralPath $serviceLogRoot -Force -Recurse)) { Assert-AllowedAcl -Path $item.FullName -Profile Writable }
    }
    foreach ($item in @(Get-Item -LiteralPath $resolvedDataRoot -Force) + @(Get-ChildItem -LiteralPath $resolvedDataRoot -Force -Recurse)) { Assert-AllowedAcl -Path $item.FullName -Profile Writable }
    $deployedServiceNames = if ($TargetService -eq 'All') { $serviceNames } else { @($TargetService) }
    $deployedFiles = foreach ($serviceName in $deployedServiceNames) {
        foreach ($extension in @('.exe', '.xml')) {
            $candidate = Join-Path $resolvedDeploymentRoot "$serviceName$extension"
            $resolvedCandidate = (Resolve-Path -LiteralPath $candidate).Path
            if (-not $resolvedCandidate.StartsWith("$resolvedDeploymentRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "Deployment artifact escaped deployment root: $resolvedCandidate"
            }
            Assert-AllowedAcl -Path $resolvedCandidate
            $resolvedCandidate
        }
    }
    if ($TargetService -eq 'All') {
        $apiHash = Get-Sha256File (Join-Path $resolvedDeploymentRoot 'PublicOpinionApi.exe')
        $workerHash = Get-Sha256File (Join-Path $resolvedDeploymentRoot 'PublicOpinionWorker.exe')
        if ($apiHash -ne $workerHash) { throw 'Deployed WinSW wrapper hashes differ' }
    }
    foreach ($serviceName in $deployedServiceNames) {
        [xml]$deployedConfig = Get-Content -LiteralPath (Join-Path $resolvedDeploymentRoot "$serviceName.xml") -Raw
        if ($deployedConfig.service.id -ne $serviceName) { throw "Deployed XML id mismatch for $serviceName" }
        Assert-ServiceAccountContract -ServiceAccount $deployedConfig.service.serviceaccount -Context "$serviceName deployed XML"
        if ($serviceName -eq 'PublicOpinionApi') {
            $expectedEntry = Join-Path $resolvedReleaseRoot 'server\src\app.js'
            $expectedWorkingDirectory = Join-Path $resolvedReleaseRoot 'server'
            $expectedLogPath = Join-Path $resolvedLogRoot 'PublicOpinionApi'
            if ([string]$deployedConfig.service.arguments -ne ('"' + $expectedEntry + '"')) { throw 'Deployed API arguments do not point to the validated release' }
            if ([string]$deployedConfig.service.workingdirectory -ne $expectedWorkingDirectory) { throw 'Deployed API workingdirectory does not point to the validated release' }
            if ([string]$deployedConfig.service.logpath -ne $expectedLogPath) { throw 'Deployed API logpath mismatch' }
            if (-not (Test-Path -LiteralPath $expectedEntry -PathType Leaf)) { throw 'Deployed API entry is missing from the validated release' }
            $environment = @{}
            foreach ($envNode in @($deployedConfig.service.env)) {
                $name = [string]$envNode.name
                if ($environment.ContainsKey($name)) { throw "Duplicate deployed API environment variable $name" }
                $environment[$name] = [string]$envNode.value
            }
            $expectedEnvironment = @{
                PUBLIC_OPINION_SERVICE_MODE = '1'; PUBLIC_OPINION_ENV_FILE = $resolvedConfigFile
                Q1_DAILY_OUT_ROOT = $resolvedDataRoot; NODE_PATH = ''; NODE_OPTIONS = ''
            }
            if ($environment.Count -ne $expectedEnvironment.Count) { throw 'Deployed API environment count mismatch' }
            foreach ($name in $expectedEnvironment.Keys) {
                if ([string]$environment[$name] -ne [string]$expectedEnvironment[$name]) { throw "Deployed API environment mismatch for $name" }
            }
            $deployedRaw = Get-Content -LiteralPath (Join-Path $resolvedDeploymentRoot "$serviceName.xml") -Raw
            if ($deployedRaw -match '%[A-Za-z_][A-Za-z0-9_]*%') { throw 'Unresolved placeholder remains in deployed API XML' }
            if (-not $Preflight -and ($deployedRaw -match '(?i)C:\\Users\\|AppData' -or $deployedRaw.IndexOf($effectiveSourceRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0)) {
                throw 'Production API XML leaks a user/source path'
            }
        }
        if ($serviceName -eq 'PublicOpinionWorker') {
            $expectedEntry = Join-Path $resolvedReleaseRoot 'worker\src\worker.js'; $expectedWorkingDirectory = Join-Path $resolvedReleaseRoot 'worker'; $expectedLogPath = Join-Path $resolvedLogRoot 'PublicOpinionWorker'
            if ([string]$deployedConfig.service.arguments -ne ('"' + $expectedEntry + '"')) { throw 'Deployed Worker arguments do not point to the validated release' }
            if ([string]$deployedConfig.service.workingdirectory -ne $expectedWorkingDirectory) { throw 'Deployed Worker workingdirectory mismatch' }
            if ([string]$deployedConfig.service.logpath -ne $expectedLogPath) { throw 'Deployed Worker logpath mismatch' }
            $environment=@{};foreach($envNode in @($deployedConfig.service.env)){$environment[[string]$envNode.name]=[string]$envNode.value}
            $manifestPath=Join-Path $resolvedReleaseRoot 'package-worker-release-manifest.json';$expectedBuildSha=Get-Sha256File $manifestPath
            $expectedEnvironment=@{WORKER_MODE='enabled';BUILD_SHA=$expectedBuildSha;UNIFIED_SOURCE_SCHEDULER_MODE='enabled';WORKER_INTERVAL_MS='60000';PUBLIC_OPINION_SERVICE_MODE='1';PUBLIC_OPINION_ENV_FILE=$resolvedConfigFile;Q1_DAILY_OUT_ROOT=$resolvedDataRoot;Q1_DAILY_LOCK_ROOT=(Join-Path $resolvedDataRoot 'locks');WORKER_STATE_ROOT=(Join-Path $resolvedDataRoot 'state');NODE_PATH='';NODE_OPTIONS=''}
            if($environment.Count-ne$expectedEnvironment.Count){throw 'Deployed Worker environment count mismatch'};foreach($name in $expectedEnvironment.Keys){if($environment[$name]-ne$expectedEnvironment[$name]){throw "Deployed Worker environment mismatch for $name"}}
            $deployedRaw = Get-Content -LiteralPath (Join-Path $resolvedDeploymentRoot "$serviceName.xml") -Raw
            if ($deployedRaw -match '%[A-Za-z_][A-Za-z0-9_]*%') { throw 'Unresolved placeholder remains in deployed Worker XML' }
            if (-not $Preflight -and ($deployedRaw -match '(?i)C:\\Users\\|AppData' -or $deployedRaw.IndexOf($effectiveSourceRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0)) { throw 'Production Worker XML leaks a user/source path' }
        }
    }
    if ($TargetService -eq 'All') {
        Write-Output "PASS: deployed same-name EXE/XML layout, matching wrapper hashes, and ACL whitelist valid at $resolvedDeploymentRoot"
    } else {
        Write-Output "PASS: deployed $TargetService EXE/XML layout and ACL whitelist valid at $resolvedDeploymentRoot"
    }
}

Write-Output 'PASS: WinSW v2 same-name templates and commands valid; all no-argument paths are zero-side-effect dry-runs'
return
