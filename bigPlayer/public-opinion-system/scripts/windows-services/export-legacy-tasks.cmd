@echo off
setlocal
set "OUT=%~dp0legacy-task-export"

if "%~1"=="" goto :dry_run
if /I "%~1"=="/dry-run" (
  if not "%~2"=="" goto :usage_error
  goto :dry_run
)
if /I not "%~1"=="/apply" goto :usage_error
if not "%~3"=="" goto :usage_error
if not "%~2"=="" set "OUT=%~2"

echo [apply] Exporting legacy scheduled task XML to %OUT%.
if not exist "%OUT%" mkdir "%OUT%"
if errorlevel 1 exit /b 1
for %%T in ("\BigPlayer Q1 Daily 02" "\BigPlayer Q1 Daily") do (
  schtasks /Query /TN %%T /XML > "%OUT%\%%~nT.xml" 2>nul
  if errorlevel 1 del /q "%OUT%\%%~nT.xml" 2>nul
)
exit /b 0

:dry_run
echo [dry-run] Would export legacy scheduled task XML to %OUT%.
echo [dry-run] No task was queried with write access or changed.
exit /b 0

:usage_error
echo ERROR: Unsupported arguments. Use /dry-run or /apply [output-directory]. 1>&2
exit /b 2
