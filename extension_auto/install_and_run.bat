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

%PYTHON% extension_developer_mode_manager.py
if errorlevel 1 pause
exit /b 0

:error
echo.
echo Installation or execution failed.
pause
exit /b 1
