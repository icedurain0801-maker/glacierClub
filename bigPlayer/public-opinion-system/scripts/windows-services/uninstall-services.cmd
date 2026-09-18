@echo off
setlocal EnableExtensions
if /I not "%~1"=="/apply" if /I not "%~1"=="/dry-run" if not "%~1"=="" goto usage
if not "%~2"=="" goto usage
if not defined SERVICE_ROOT set "SERVICE_ROOT=%ProgramData%\PublicOpinion\services"
echo [dry-run] Would stop and uninstall PublicOpinionApi and PublicOpinionWorker via same-name WinSW wrappers.
echo [dry-run] No service, file, task, environment variable, or process was changed.
if /I not "%~1"=="/apply" exit /b 0
for %%S in (PublicOpinionApi PublicOpinionWorker) do (
  if exist "%SERVICE_ROOT%\%%S.exe" (
    "%SERVICE_ROOT%\%%S.exe" stop >nul 2>&1
    "%SERVICE_ROOT%\%%S.exe" uninstall || exit /b 1
  )
)
exit /b 0
:usage
echo Usage: %~nx0 [/dry-run^|/apply]
exit /b 2
