@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "TASK_NAME=\BigPlayer Q1 Daily 02"
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%q1-daily.cmd") do set "TASK_CMD=%%~fI"
for %%I in ("%ComSpec%") do set "COMSPEC_EXE=%%~fI"
for %%I in ("%SCRIPT_DIR%src\q1DailyJob.js") do set "JOB_SCRIPT=%%~fI"
for %%I in ("%SCRIPT_DIR%..\logs") do set "LOG_DIR=%%~fI"
set "LOG_FILE=%LOG_DIR%\q1-daily-task.log"
set "NODE_EXE="
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE for /f "delims=" %%I in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%~fI"

rem schtasks /TR receives a cmd.exe wrapper with only /c; never include the disable-directory switch in /TR.
set "TASK_ACTION=\"!COMSPEC_EXE!\" /c \"\"!TASK_CMD!\"\""
goto main

:main
if /I "%~1"=="/dry-run" goto dry_run
if /I "%~1"=="/remove" goto remove
if /I "%~1"=="/uninstall" goto remove
if "%~1"=="" goto install
if /I "%~1"=="/install" goto install
goto usage

:install
if not "%~2"=="" goto usage
call :validate
set "rc=%errorlevel%"
if not "%rc%"=="0" exit /b %rc%
if not defined Q1_SOURCE_ID (
  >&2 echo Q1_SOURCE_ID is required for task registration.
  exit /b 2
)

schtasks /Create /TN "%TASK_NAME%" /SC DAILY /ST 02:00 /TR "!TASK_ACTION!" /F >nul
set "rc=%errorlevel%"
if not "%rc%"=="0" (
  >&2 echo Failed to install %TASK_NAME%.
  exit /b %rc%
)
call :verify_task
set "rc=%errorlevel%"
if not "%rc%"=="0" (
  >&2 echo Task registration verification failed for %TASK_NAME%.
  exit /b %rc%
)
echo Installed %TASK_NAME% to run q1-daily.cmd daily at 02:00.
echo Controlled switch: when UNIFIED_SOURCE_SCHEDULER_MODE=enabled, this legacy scheduled entry yields at runtime.
echo This installer does not disable or delete Windows tasks automatically.
exit /b 0

:validate
if not defined NODE_EXE (
  >&2 echo node.exe was not found.
  exit /b 9009
)
if not exist "%TASK_CMD%" (
  >&2 echo q1-daily.cmd was not found.
  exit /b 2
)
if not exist "%JOB_SCRIPT%" (
  >&2 echo q1DailyJob.js was not found.
  exit /b 2
)
exit /b 0

:verify_task
for /f "usebackq delims=" %%I in (`powershell.exe -NoProfile -NonInteractive -Command "$xml=[xml](& schtasks /Query /TN '%TASK_NAME%' /XML); $action=$xml.Task.Actions.Exec; if ($xml.Task.Triggers.CalendarTrigger.ScheduleByDay.DaysInterval -ne '1' -or $xml.Task.Triggers.CalendarTrigger.StartBoundary -notmatch 'T02:00:00' -or $action.Command -ne '%TASK_CMD%') { exit 1 }; if ($action.Arguments) { exit 1 }; 'verified'"`) do if /I "%%I"=="verified" exit /b 0
exit /b 1

:dry_run
if not "%~2"=="" goto usage
if not defined Q1_SOURCE_ID (
  >&2 echo Q1_SOURCE_ID is required for dry-run.
  exit /b 2
)
call :validate
set "rc=%errorlevel%"
if not "%rc%"=="0" exit /b %rc%
echo Task name: %TASK_NAME%
echo Schedule: DAILY at 02:00
echo Action: !TASK_ACTION!
echo Node: %NODE_EXE%
echo Script: %JOB_SCRIPT%
echo Controlled switch: when UNIFIED_SOURCE_SCHEDULER_MODE=enabled, this legacy scheduled entry yields at runtime.
echo This installer does not disable or delete Windows tasks automatically.
echo No task was created, changed, deleted, or started.
exit /b 0

:remove
if not "%~2"=="" goto usage
schtasks /Delete /TN "%TASK_NAME%" /F >nul
set "rc=%errorlevel%"
if not "%rc%"=="0" (
  >&2 echo Failed to remove %TASK_NAME%.
  exit /b %rc%
)
echo Removed %TASK_NAME%.
exit /b 0

:usage
>&2 echo Usage: %~nx0 [/install^|/dry-run^|/remove]
exit /b 2
