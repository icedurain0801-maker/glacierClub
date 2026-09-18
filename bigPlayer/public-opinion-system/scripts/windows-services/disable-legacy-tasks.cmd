@echo off
setlocal
echo [dry-run] Legacy tasks eligible for disable: \BigPlayer Q1 Daily 02, \BigPlayer Q1 Daily
echo [dry-run] No task was disabled. Pass /apply only after explicit stage B approval.
if /I not "%~1"=="/apply" exit /b 0
for %%T in ("\BigPlayer Q1 Daily 02" "\BigPlayer Q1 Daily") do schtasks /Change /TN %%T /DISABLE
exit /b 0
