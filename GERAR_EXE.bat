@echo off
chcp 65001 >nul
title Gerador do Relatório Financeiro IBPV
cd /d "%~dp0"

echo =====================================================
echo   RELATORIO FINANCEIRO IBPV - GERADOR PARA WINDOWS
echo =====================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao foi encontrado neste computador.
  echo.
  echo Instale a versao LTS do Node.js e execute este arquivo novamente.
  echo Site oficial: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo [1/2] Preparando os componentes do aplicativo...
call npm install
if errorlevel 1 (
  echo.
  echo Nao foi possivel baixar os componentes.
  echo Verifique sua conexao com a internet e tente novamente.
  pause
  exit /b 1
)

echo.
echo [2/2] Gerando o instalador e a versao portatil...
call npm run build
if errorlevel 1 (
  echo.
  echo Ocorreu um erro durante a geracao.
  pause
  exit /b 1
)

echo.
echo =====================================================
echo CONCLUIDO!
echo Os arquivos foram criados na pasta DIST.
echo =====================================================
start "" "%~dp0dist"
pause
