@echo off
setlocal
cd /d "%~dp0"
title Extension Developer Mode Manager v18.1

where py >nul 2>nul
if %errorlevel%==0 (
    set PYTHON=py
) else (
    set PYTHON=python
)

%PYTHON% -c "import pywinauto, psutil" >nul 2>nul
if errorlevel 1 (
    echo Installing required packages...
    %PYTHON% -m pip install -r requirements.txt
    if errorlevel 1 goto :error
)

rem 도구 창·콘솔을 작업 표시줄에서 최소화 상태로 시작(v1.48.1)
start "ExtTool" /min /wait %PYTHON% extension_developer_mode_manager.py
if errorlevel 1 pause
exit /b 0

:error
echo.
echo Installation or execution failed.
pause
exit /b 1
