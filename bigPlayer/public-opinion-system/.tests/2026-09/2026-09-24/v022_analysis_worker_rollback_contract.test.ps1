$ErrorActionPreference = 'Stop'
$scriptPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..\scripts\windows-services\rollback-services.cmd')).Path
$content = Get-Content -LiteralPath $scriptPath -Raw

if ($content -notmatch '(?im)^if /I not "%~1"=="/apply" if /I not "%~1"=="/dry-run" if not "%~1"=="" goto usage\s*$') { throw 'Rollback argument gate missing' }
if ($content -notmatch '(?im)^if not "%~2"=="" goto usage\s*$') { throw 'Rollback extra-argument gate missing' }
if ($content -notmatch '(?im)^if /I not "%~1"=="/apply" exit /b 0\s*$') { throw 'Default dry-run gate missing' }
$applyGate = $content.IndexOf('if /I not "%~1"=="/apply" exit /b 0')
$loop = [regex]::Match($content, '(?im)^for %%S in \(PublicOpinionApi PublicOpinionWorker PublicOpinionAnalysisWorker\) do \(\s*$')
if (-not $loop.Success -or $loop.Index -le $applyGate) { throw 'Controlled rollback service order incomplete' }
if ($content -notmatch '(?im)^\s*if not exist "%SERVICE_ROOT%\\%%S\.exe" \(\s*$' -or $content -notmatch '(?im)^\s*sc query "%%S" >nul 2>&1 && \(\s*$') { throw 'Missing wrapper must not leave an installed service behind silently' }
if ($content -notmatch '(?im)^\s*"%SERVICE_ROOT%\\%%S\.exe" stop >nul 2>&1\s*$') { throw 'Rollback stop command missing' }
if ($content -notmatch '(?im)^\s*"%SERVICE_ROOT%\\%%S\.exe" uninstall >nul 2>&1 \|\| exit /b 1\s*$') { throw 'Rollback must fail when uninstall fails' }
if ($content -notmatch '(?im)^echo Restore legacy tasks from the previously exported XML manually') { throw 'Manual legacy task recovery notice missing' }

$dryRun = & $scriptPath
if ($LASTEXITCODE -ne 0 -or ($dryRun -join "`n") -notmatch 'PublicOpinionApi/PublicOpinionWorker/PublicOpinionAnalysisWorker') { throw 'Default dry-run did not list AnalysisWorker' }
Write-Output 'PASS: rollback dry-run and three-service controlled apply contract'
