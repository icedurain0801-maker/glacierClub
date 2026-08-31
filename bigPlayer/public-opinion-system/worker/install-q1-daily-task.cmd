@echo off
setlocal
set "TASK_NAME=\BigPlayer Q1 Daily 02"
set "SCRIPT_DIR=%~dp0"
set "TASK_CMD=%SCRIPT_DIR%q1-daily.cmd"

if /I "%1"=="/remove" goto remove
if /I "%1"=="/uninstall" goto remove
if not "%1"=="" if /I not "%1"=="/install" goto usage

schtasks /Create /TN "%TASK_NAME%" /SC DAILY /ST 02:00 /TR "\"%TASK_CMD%\"" /F >nul
if errorlevel 1 (
  >&2 echo Failed to install %TASK_NAME%.
  exit /b 1
)
echo Installed %TASK_NAME% to run q1-daily.cmd daily at 02:00.
exit /b 0

:remove
schtasks /Delete /TN "%TASK_NAME%" /F >nul
if errorlevel 1 (
  >&2 echo Failed to remove %TASK_NAME%.
  exit /b 1
)
echo Removed %TASK_NAME%.
exit /b 0

:usage
>&2 echo Usage: %~nx0 [/install^|/remove]
exit /b 2
