@echo off
chcp 65001 >nul
cd /d "%~dp0"

if exist "%~dp0BiofeedbackHub.exe" (
    start "" "%~dp0BiofeedbackHub.exe"
    exit /b 0
)

if exist "%~dp0hub-ue\.venv\Scripts\pythonw.exe" (
    start "" "%~dp0hub-ue\.venv\Scripts\pythonw.exe" "%~dp0launcher_app.py"
    exit /b 0
)

echo Ambiente ainda nao preparado. Configurando automaticamente pela primeira vez...
cd /d "%~dp0hub-ue"
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e apps\hub numpy scipy bleak polar-python
call npm.cmd install
call npm.cmd run build:dashboard
cd /d "%~dp0"
start "" "%~dp0hub-ue\.venv\Scripts\pythonw.exe" "%~dp0launcher_app.py"

