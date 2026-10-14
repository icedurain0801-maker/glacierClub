$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
function Read-Ast([string]$Relative) {
    $tokens = $null; $errors = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $project $Relative), [ref]$tokens, [ref]$errors)
    if ($errors.Count) { throw $errors[0] }
    return $ast
}
function Assert-Throws([scriptblock]$Action, [string]$Pattern) {
    try { & $Action } catch { if ($_.Exception.Message -match $Pattern) { return }; throw }
    throw "Expected failure matching $Pattern"
}
$prepare = Read-Ast 'scripts/windows-services/prepare-services.ps1'
$treeFunction = $prepare.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Set-StrictTreeAcl' }, $true)
. ([scriptblock]::Create($treeFunction.Extent.Text))

# Only mocked filesystem/ACL calls; never apply the deployment script.
& {
    $rootItem = [IO.DirectoryInfo]::new($project)
    function Get-Item { return $rootItem }
    function Get-ChildItem { [CmdletBinding()]param($LiteralPath, [switch]$Force, [switch]$Recurse) Write-Error 'fixture enumeration denied' }
    function Set-FileSystemAclCompat { throw 'must not write before enumeration succeeds' }
    Assert-Throws { Set-StrictTreeAcl $project ReadAndExecute } 'fixture enumeration denied'
}
& {
    $rootItem = [IO.DirectoryInfo]::new($project)
    $child = [IO.FileInfo]::new((Join-Path $project 'package.json'))
    function Get-Item { return $rootItem }
    function Get-ChildItem { return $child }
    function New-StrictSecurity { return $null }
    function Set-FileSystemAclCompat { param($Item, $Acl) if ($Item.FullName -eq $child.FullName) { throw 'fixture child ACL denied' } }
    Assert-Throws { Set-StrictTreeAcl $project ReadAndExecute } 'fixture child ACL denied'
}

$manage = Read-Ast 'scripts/windows-services/manage-analysis-worker.ps1'
$tryNode = $manage.FindAll({ param($node) $node -is [Management.Automation.Language.TryStatementAst] -and $node.CatchClauses.Count -and $node.Extent.Text.Contains('$createdWrapper') }, $true) | Select-Object -Last 1
$rollback = [scriptblock]::Create($tryNode.CatchClauses[0].Body.Extent.Text.Trim().Substring(1).TrimEnd('}'))
foreach ($scenario in @('stop-fails', 'uninstall-fails', 'still-registered', 'query-fails', 'removed')) {
    & {
        $createdWrapper = $true; $createdXml = $true
        $analysisExe = 'Invoke-FixtureWrapper'; $analysisXmlPath = 'fixture.xml'; $name = 'fixture-service'
        $script:removed = 0; $script:queries = 0
        function Get-Service {
            if ($scenario -eq 'query-fails') { throw 'fixture SCM query denied' }
            $script:queries += 1
            if ($scenario -eq 'removed' -and $script:queries -gt 1) { return }
            [pscustomobject]@{ Name = 'fixture-service'; Status = 'Running' }
        }
        function Invoke-FixtureWrapper([string]$Action) {
            $global:LASTEXITCODE = if (($scenario -eq 'stop-fails' -and $Action -eq 'stop') -or ($scenario -eq 'uninstall-fails' -and $Action -eq 'uninstall')) { 1 } else { 0 }
        }
        function Test-Path { return $true }
        function Remove-Item { $script:removed += 1 }
        try { throw 'original fixture install failure' } catch {
            try { & $rollback } catch { $message = $_.Exception.Message }
        }
        $expected = if ($scenario -eq 'removed') { 2 } else { 0 }
        if ($script:removed -ne $expected) { throw "$scenario removed $script:removed artifacts, expected $expected" }
        if (-not $message) { throw "$scenario lost failure report" }
    }
}
Write-Output 'PASS ACL enumeration/write failures propagate; rollback preserves artifacts on stop/uninstall/SCM failure'
