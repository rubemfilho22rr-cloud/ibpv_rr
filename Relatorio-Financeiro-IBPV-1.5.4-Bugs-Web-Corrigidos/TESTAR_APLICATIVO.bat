@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js LTS para testar o aplicativo.
  pause
  exit /b 1
)
if not exist node_modules call npm install
call npm start
