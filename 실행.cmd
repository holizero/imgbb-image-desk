@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 이상을 먼저 설치해 주세요.
  echo https://nodejs.org/ko
  if /i not "%~1"=="--check" pause
  exit /b 1
)
node launcher.cjs %*
if errorlevel 1 (
  if /i not "%~1"=="--check" pause
  exit /b 1
)
