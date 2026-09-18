@echo off
setlocal EnableExtensions
if /I not "%~1"=="/query" if /I not "%~1"=="/dry-run" if not "%~1"=="" goto usage
if not "%~2"=="" goto usage
if not defined SERVICE_ROOT set "SERVICE_ROOT=%ProgramData%\PublicOpinion\services"
echo [dry-run] Would query PublicOpinionApi and PublicOpinionWorker via same-name WinSW wrappers.
echo [dry-run] No service, file, task, environment variable, or process was changed.
if /I not "%~1"=="/query" exit /b 0
for %%S in (PublicOpinionApi PublicOpinionWorker PublicOpinionTranslationWorker) do (
  if not exist "%SERVICE_ROOT%\%%S.exe" (
    echo Missing wrapper: %SERVICE_ROOT%\%%S.exe 1>&2
    exit /b 2
  )
  "%SERVICE_ROOT%\%%S.exe" status || exit /b 1
)
exit /b 0
:usage
echo Usage: %~nx0 [/dry-run^|/query]
exit /b 2
