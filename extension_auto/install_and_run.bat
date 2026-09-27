@echo off
setlocal
cd /d "%~dp0"

rem 1st: bundled standalone EXE - works without Python on the target PC (v1.48.3).
if exist "%~dp0ExtensionDeveloperModeManager.exe" (
    start "" "%~dp0ExtensionDeveloperModeManager.exe"
    exit /b 0
)

rem 2nd: Python environment (requires pywinauto + psutil - auto-installed once).
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

start "ExtTool" %PYTHON% extension_developer_mode_manager.py
exit /b 0

:error
echo.
echo Installation or execution failed.
pause
exit /b 1
