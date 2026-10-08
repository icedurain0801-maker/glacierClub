@echo off
setlocal EnableExtensions
echo [dry-run] Would stop and uninstall PublicOpinionApi/PublicOpinionWorker/PublicOpinionAnalysisWorker, then restore exported legacy tasks manually.
echo [dry-run] No service or task was changed. Pass /apply only after explicit stage B approval.
if /I not "%~1"=="/apply" if /I not "%~1"=="/dry-run" if not "%~1"=="" goto usage
if not "%~2"=="" goto usage
if /I not "%~1"=="/apply" exit /b 0
if not defined SERVICE_ROOT set "SERVICE_ROOT=%ProgramData%\PublicOpinion\services"
for %%S in (PublicOpinionApi PublicOpinionWorker PublicOpinionAnalysisWorker) do (
  if not exist "%SERVICE_ROOT%\%%S.exe" (
    sc query "%%S" >nul 2>&1 && (
      echo Installed service %%S is missing its WinSW wrapper; rollback stopped. 1>&2
      exit /b 1
    )
  ) else (
    "%SERVICE_ROOT%\%%S.exe" stop >nul 2>&1
    "%SERVICE_ROOT%\%%S.exe" uninstall >nul 2>&1 || exit /b 1
  )
)
echo Restore legacy tasks from the previously exported XML manually or with schtasks /Create.
exit /b 0
:usage
echo Usage: %~nx0 [/dry-run^|/apply]
exit /b 2
