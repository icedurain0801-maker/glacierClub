@echo off
setlocal EnableExtensions
set "WORKER_DIR=%~dp0"
for %%I in ("%WORKER_DIR%..\..") do set "PROJECT_DIR=%%~fI"
set "LOG_DIR=%PROJECT_DIR%\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1
set "LOG_FILE=%LOG_DIR%\q1-daily.log"

if "%Q1_SOURCE_ID%"=="" (
  >&2 echo Q1_SOURCE_ID is required
  exit /b 2
)
if not exist "%LOG_DIR%" (
  >&2 echo Failed to create Q1 log directory.
  exit /b 1
)

pushd "%PROJECT_DIR%" >nul 2>&1
if errorlevel 1 (
  >&2 echo Failed to set Q1 daily working directory.
  exit /b 1
)

rem Resolve node.exe explicitly so Task Scheduler does not depend on PATH.
set "NODE_EXE="
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE for /f "delims=" %%I in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%~fI"
if not defined NODE_EXE (
  >&2 echo node.exe was not found.
  popd
  exit /b 9009
)

rem q1DailyJob.js already sanitizes application messages; sanitize the complete stream before persistence.
set "Q1_LOG_FILE=%LOG_FILE%"
"%NODE_EXE%" "%PROJECT_DIR%\public-opinion-system\worker\src\q1DailyJob.js" 2>&1 | powershell.exe -NoProfile -NonInteractive -Command "$log=$env:Q1_LOG_FILE; [Console]::In.ReadToEnd() -split '\r?\n' | %% { if ($_ -ne '') { $line=$_ -replace '(?i)(authorization|cookie|token|password|secret|api[-_ ]?key|apikey)\s*[:=]\s*[''\"]?[^\s,;}&''\"]+', '$1=[redacted]' -replace '(?i)Bearer\s+[^\s,;}]+', 'Bearer [redacted]'; Add-Content -LiteralPath $log -Value $line -Encoding UTF8 } }"
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%