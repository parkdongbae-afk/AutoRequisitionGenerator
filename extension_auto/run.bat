@echo off
setlocal
cd /d "%~dp0"

if exist "%~dp0ExtensionDeveloperModeManager.exe" (
    start "" "%~dp0ExtensionDeveloperModeManager.exe"
    exit /b 0
)

where py >nul 2>nul
if %errorlevel%==0 (
    py extension_developer_mode_manager.py
) else (
    python extension_developer_mode_manager.py
)
if errorlevel 1 pause
