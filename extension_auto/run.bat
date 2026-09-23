@echo off
setlocal
cd /d "%~dp0"
title Extension Developer Mode Manager v18.1
where py >nul 2>nul
if %errorlevel%==0 (
    py extension_developer_mode_manager.py
) else (
    python extension_developer_mode_manager.py
)
if errorlevel 1 pause
