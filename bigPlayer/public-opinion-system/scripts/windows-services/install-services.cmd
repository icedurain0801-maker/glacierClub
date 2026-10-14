@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "ROOT=%~dp0..\.."
for %%I in ("%ROOT%") do set "APP_ROOT=%%~fI"
if /I not "%~1"=="/apply" if /I not "%~1"=="/preflight" if /I not "%~1"=="/dry-run" if not "%~1"=="" goto usage
set "TARGET=All"
set "MODE=DryRun"
if /I "%~1"=="/apply" set "MODE=Apply"
if /I "%~1"=="/preflight" set "MODE=Preflight"
if /I not "!MODE!"=="DryRun" (
  if "%~2"=="" goto usage
  if /I "%~2"=="PublicOpinionApi" set "TARGET=PublicOpinionApi"
  if /I "%~2"=="PublicOpinionWorker" set "TARGET=PublicOpinionWorker"
  if /I "%~2"=="All" set "TARGET=All"
  if /I not "%~2"=="PublicOpinionApi" if /I not "%~2"=="PublicOpinionWorker" if /I not "%~2"=="All" goto usage
  if not "%~3"=="" goto usage
) else (
  if not "%~2"=="" goto usage
)
set "SERVICES=PublicOpinionApi PublicOpinionWorker"
if /I "%TARGET%"=="PublicOpinionApi" set "SERVICES=PublicOpinionApi"
if /I "%TARGET%"=="PublicOpinionWorker" set "SERVICES=PublicOpinionWorker"
set "WIN_SW_SOURCE=%WIN_SW_EXE%"
if not defined WIN_SW_SOURCE set "WIN_SW_SOURCE=%~dp0winsw.exe"
if not defined SERVICE_ROOT set "SERVICE_ROOT=%ProgramData%\PublicOpinion\services"
if not defined SERVICE_LOG_ROOT set "SERVICE_LOG_ROOT=%ProgramData%\PublicOpinion\logs"
set "RELEASE_BASE=%ProgramData%\PublicOpinion\releases"
set "RELEASE_ID=release-%RANDOM%-%RANDOM%-%RANDOM%"
if /I "%TARGET%"=="PublicOpinionWorker" set "RELEASE_ID=worker-release-%RANDOM%-%RANDOM%-%RANDOM%"
set "RUNTIME_ROOT=%RELEASE_BASE%\%RELEASE_ID%"
set "CONFIG_FILE=%ProgramData%\PublicOpinion\config\public-opinion.env"
set "DATA_ROOT=%ProgramData%\PublicOpinion\data"
if not defined NODE_EXE set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined POWERSHELL_EXE set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
echo [dry-run] APP_ROOT=%APP_ROOT%
echo [dry-run] NODE_EXE=%NODE_EXE%
echo [dry-run] SERVICE_ROOT=%SERVICE_ROOT%
echo [dry-run] SERVICE_LOG_ROOT=%SERVICE_LOG_ROOT%
echo [dry-run] RELEASE_BASE=%RELEASE_BASE%
echo [dry-run] TARGET=%TARGET%
echo [dry-run] Would deploy one verified WinSW binary for: %SERVICES%.
echo [dry-run] Each selected wrapper would discover its same-name XML and run install with no XML argument.
echo [dry-run] No service, environment variable, task, or process was changed.
if /I "!MODE!"=="DryRun" exit /b 0
if /I "%MODE%"=="Apply" if /I "%TARGET%"=="All" (
  echo Combined /apply remains disabled; install API and Worker through separate approvals.
  exit /b 2
)
if not exist "%WIN_SW_SOURCE%" (
  echo WinSW executable not found: %WIN_SW_SOURCE%
  exit /b 2
)
if not exist "%NODE_EXE%" (
  echo node.exe not found: %NODE_EXE%
  exit /b 2
)
if /I "!MODE!"=="Preflight" (
  if /I "%TARGET%"=="PublicOpinionWorker" (
    "%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepare-worker-preflight.ps1" -Mode Preflight -AppRoot "%APP_ROOT%" -WinSWSource "%WIN_SW_SOURCE%" -NodeExe "%NODE_EXE%" -ConfigFile "%CONFIG_FILE%" -RunReadiness
    exit /b !ERRORLEVEL!
  )
  "%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepare-services.ps1" -Mode Preflight -TargetService "%TARGET%" -AppRoot "%APP_ROOT%" -WinSWSource "%WIN_SW_SOURCE%" -NodeExe "%NODE_EXE%" -RuntimeRoot "%RUNTIME_ROOT%" -ReleaseBase "%RELEASE_BASE%" -ConfigFile "%CONFIG_FILE%" -DataRoot "%DATA_ROOT%"
  exit /b !ERRORLEVEL!
)
if /I "%TARGET%"=="PublicOpinionWorker" (
  "%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepare-worker-preflight.ps1" -Mode Apply -AppRoot "%APP_ROOT%" -WinSWSource "%WIN_SW_SOURCE%" -NodeExe "%NODE_EXE%" -ConfigFile "%CONFIG_FILE%" -RuntimeRoot "%RUNTIME_ROOT%" -ReleaseBase "%RELEASE_BASE%" -ServiceRoot "%SERVICE_ROOT%" -LogRoot "%SERVICE_LOG_ROOT%" -DataRoot "%DATA_ROOT%" -RunReadiness || exit /b 1
  "%SERVICE_ROOT%\PublicOpinionWorker.exe" install || goto worker_install_failure
  set "ACTUAL_ACCOUNT="
  for /f "tokens=1,* delims=:" %%A in ('sc.exe qc "PublicOpinionWorker" ^| findstr /I /C:"SERVICE_START_NAME"') do set "ACTUAL_ACCOUNT=%%B"
  set "NORMALIZED_ACCOUNT=!ACTUAL_ACCOUNT: =!"
  if /I not "!NORMALIZED_ACCOUNT!"=="NTAUTHORITY\LocalService" goto worker_install_failure
  exit /b 0
)
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepare-services.ps1" -Mode Apply -TargetService "%TARGET%" -AppRoot "%APP_ROOT%" -WinSWSource "%WIN_SW_SOURCE%" -NodeExe "%NODE_EXE%" -RuntimeRoot "%RUNTIME_ROOT%" -ReleaseBase "%RELEASE_BASE%" -ServiceRoot "%SERVICE_ROOT%" -LogRoot "%SERVICE_LOG_ROOT%" -ConfigFile "%CONFIG_FILE%" -DataRoot "%DATA_ROOT%" || exit /b 1
for %%S in (%SERVICES%) do (
  "%SERVICE_ROOT%\%%S.exe" install || goto install_failure
  set "ACTUAL_ACCOUNT="
  for /f "tokens=1,* delims=:" %%A in ('sc.exe qc "%%S" ^| findstr /I /C:"SERVICE_START_NAME"') do set "ACTUAL_ACCOUNT=%%B"
  set "NORMALIZED_ACCOUNT=!ACTUAL_ACCOUNT: =!"
  if /I not "!NORMALIZED_ACCOUNT!"=="NTAUTHORITY\LocalService" (
    set "FAILED_SERVICE=%%S"
    goto account_failure
  )
)
exit /b 0
:worker_install_failure
if exist "%SERVICE_ROOT%\PublicOpinionWorker.exe" (
  "%SERVICE_ROOT%\PublicOpinionWorker.exe" stop >nul 2>&1
  "%SERVICE_ROOT%\PublicOpinionWorker.exe" uninstall >nul 2>&1
)
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0remove-worker-release.ps1" -ReleaseRoot "%RUNTIME_ROOT%" -ReleaseBase "%RELEASE_BASE%" -ServiceRoot "%SERVICE_ROOT%" >nul 2>&1
echo Worker install failed; only this Worker release and Worker wrapper/XML were removed.
exit /b 1
:account_failure
set "EVIDENCE_ROOT=%APP_ROOT%\.temp\windows-services-stage-b1\account-validation-%RANDOM%-%RANDOM%"
if not exist "!EVIDENCE_ROOT!" mkdir "!EVIDENCE_ROOT!" >nul 2>&1
if exist "%SERVICE_ROOT%\!FAILED_SERVICE!.exe" copy /Y "%SERVICE_ROOT%\!FAILED_SERVICE!.exe" "!EVIDENCE_ROOT!\!FAILED_SERVICE!.exe" >nul 2>&1
if exist "%SERVICE_ROOT%\!FAILED_SERVICE!.xml" copy /Y "%SERVICE_ROOT%\!FAILED_SERVICE!.xml" "!EVIDENCE_ROOT!\!FAILED_SERVICE!.xml" >nul 2>&1
if exist "%SERVICE_LOG_ROOT%\!FAILED_SERVICE!\!FAILED_SERVICE!.wrapper.log" copy /Y "%SERVICE_LOG_ROOT%\!FAILED_SERVICE!\!FAILED_SERVICE!.wrapper.log" "!EVIDENCE_ROOT!\!FAILED_SERVICE!.wrapper.log" >nul 2>&1
>"!EVIDENCE_ROOT!\service-account.txt" echo service=!FAILED_SERVICE!
>>"!EVIDENCE_ROOT!\service-account.txt" echo expected=NT AUTHORITY\LocalService
>>"!EVIDENCE_ROOT!\service-account.txt" echo actual=!ACTUAL_ACCOUNT!
for %%R in (%SERVICES%) do (
  if exist "%SERVICE_ROOT%\%%R.exe" (
    "%SERVICE_ROOT%\%%R.exe" stop >nul 2>&1
    "%SERVICE_ROOT%\%%R.exe" uninstall >nul 2>&1
  )
)
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0remove-api-release.ps1" -ReleaseRoot "%RUNTIME_ROOT%" -ReleaseBase "%RELEASE_BASE%" -ServiceRoot "%SERVICE_ROOT%" >nul 2>&1
echo Service account verification failed; installed service was rolled back. Evidence: !EVIDENCE_ROOT!
exit /b 1
:install_failure
for %%R in (%SERVICES%) do (
  if exist "%SERVICE_ROOT%\%%R.exe" (
    "%SERVICE_ROOT%\%%R.exe" stop >nul 2>&1
    "%SERVICE_ROOT%\%%R.exe" uninstall >nul 2>&1
  )
)
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0remove-api-release.ps1" -ReleaseRoot "%RUNTIME_ROOT%" -ReleaseBase "%RELEASE_BASE%" -ServiceRoot "%SERVICE_ROOT%" >nul 2>&1
echo WinSW install failed; new release was removed and previous releases were retained.
exit /b 1
:usage
echo Usage: %~nx0 [/dry-run ^| /preflight PublicOpinionApi^|PublicOpinionWorker^|All ^| /apply PublicOpinionApi^|PublicOpinionWorker^|All]
exit /b 2
