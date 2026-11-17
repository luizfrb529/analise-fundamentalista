@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================================
echo  Analise Fundamentalista - atualizar dados e abrir o site
echo ============================================================

if not exist ".venv\Scripts\python.exe" (
  echo Criando ambiente virtual Python em .venv ...
  python -m venv .venv || (echo Python nao encontrado. Instale o Python 3.11+ e tente de novo. & pause & exit /b 1)
  ".venv\Scripts\python.exe" -m pip install --timeout 120 -r pipeline\requirements.txt || (echo Falha ao instalar dependencias. & pause & exit /b 1)
)

echo.
echo [1/2] Atualizando dados (leva de 1 a 3 minutos)...
".venv\Scripts\python.exe" pipeline\update.py
if errorlevel 1 (
  echo.
  echo O pipeline terminou com erro. O site abre com os dados da ultima execucao.
)

echo.
echo [2/2] Abrindo o site em http://localhost:8000 ...
start "" "http://localhost:8000/index.html"
echo Feche esta janela para desligar o servidor local.
".venv\Scripts\python.exe" -m http.server 8000 --bind 127.0.0.1
