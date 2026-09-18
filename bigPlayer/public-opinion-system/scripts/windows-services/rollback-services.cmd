@echo off
setlocal EnableExtensions
echo [dry-run] Would stop and uninstall PublicOpinionApi/PublicOpinionWorker, then restore exported legacy tasks.
echo [dry-run] No service or task was changed. Pass /apply only after explicit stage B approval.
if /I not "%~1"=="/apply" if /I not "%~1"=="/dry-run" if not "%~1"=="" goto usage
if not "%~2"=="" goto usage
if /I not "%~1"=="/apply" exit /b 0
if not defined SERVICE_ROOT set "SERVICE_ROOT=%ProgramData%\PublicOpinion\services"
for %%S in (PublicOpinionApi PublicOpinionWorker) do (
  if exist "%SERVICE_ROOT%\%%S.exe" (
    "%SERVICE_ROOT%\%%S.exe" stop >nul 2>&1
    "%SERVICE_ROOT%\%%S.exe" uninstall >nul 2>&1
  )
)
echo Restore legacy tasks from the previously exported XML manually or with schtasks /Create.
exit /b 0
:usage
echo Usage: %~nx0 [/dry-run^|/apply]
exit /b 2
