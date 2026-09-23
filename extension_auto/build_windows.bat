@echo off
setlocal
cd /d "%~dp0"
title Extension Developer Mode Manager v18.1 - Build

where py >nul 2>nul
if %errorlevel%==0 (
    set PYTHON=py
) else (
    set PYTHON=python
)

if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist ExtensionDeveloperModeManager.spec del /q ExtensionDeveloperModeManager.spec

echo [1/2] Installing build packages...
%PYTHON% -m pip install --upgrade pyinstaller
%PYTHON% -m pip install -r requirements.txt
if errorlevel 1 goto :error

echo [2/2] Building Windows EXE...
%PYTHON% -m PyInstaller --noconfirm --clean --onefile --windowed ^
  --name ExtensionDeveloperModeManager ^
  --add-data "test_extension;test_extension" ^
  --collect-all pywinauto ^
  --hidden-import=comtypes.stream ^
  extension_developer_mode_manager.py
if errorlevel 1 goto :error

echo.
echo Build completed:
echo %CD%\dist\ExtensionDeveloperModeManager.exe
pause
exit /b 0

:error
echo.
echo Build failed.
pause
exit /b 1
