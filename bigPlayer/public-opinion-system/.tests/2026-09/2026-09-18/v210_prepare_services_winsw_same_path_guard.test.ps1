$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$scriptPath = Join-Path $projectRoot 'scripts\windows-services\prepare-services.ps1'
$scriptText = Get-Content -LiteralPath $scriptPath -Raw
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw "prepare-services.ps1 syntax errors: $($parseErrors.Message -join ' | ')" }

$guard = $ast.Find({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Assert-DistinctFilePath'
}, $true)
if ($null -eq $guard) { throw 'WinSW source/target same-path guard is missing' }
Invoke-Expression $guard.Extent.Text

$samePathRejected = $false
try {
    Assert-DistinctFilePath -Source 'C:\ProgramData\PublicOpinion\services\PublicOpinionApi.exe' `
        -Destination 'c:\programdata\publicopinion\services\PUBLICOPINIONAPI.EXE' -Label 'test target'
} catch {
    $samePathRejected = $_.Exception.Message -match 'must not resolve to the same path'
}
if (-not $samePathRejected) { throw 'Same WinSW source and wrapper target was not rejected' }

Assert-DistinctFilePath -Source 'C:\verified\WinSW-x64.exe' `
    -Destination 'C:\ProgramData\PublicOpinion\services\PublicOpinionApi.exe' -Label 'test target'

$guardCall = $scriptText.IndexOf('Assert-DistinctFilePath -Source $resolvedWinSWSource -Destination $wrapperPath')
$firstWrite = $scriptText.IndexOf('New-Item -ItemType Directory -Path $effectiveReleaseBase')
$releaseBuild = $scriptText.IndexOf("& (Join-Path `$PSScriptRoot 'build-api-release.ps1')")
if ($guardCall -lt 0 -or $firstWrite -lt 0 -or $releaseBuild -lt 0) { throw 'Same-path guard ordering markers are missing' }
if ($guardCall -gt $firstWrite -or $guardCall -gt $releaseBuild) { throw 'Same-path guard must run before release or service artifact writes' }

Write-Output 'PASS: prepare-services rejects a case-insensitive identical WinSW source/wrapper path before release or service artifact writes'
