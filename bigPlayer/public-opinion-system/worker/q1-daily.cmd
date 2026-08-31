@echo off
setlocal
cd /d "%~dp0..\.."
if "%Q1_SOURCE_ID%"=="" (
  echo Q1_SOURCE_ID is required 1>&2
  exit /b 2
)
rem 由 q1DailyJob.js 按北京时间业务日期统一生成输出目录，避免使用当前系统日期。
node public-opinion-system/worker/src/q1DailyJob.js
exit /b %errorlevel%
