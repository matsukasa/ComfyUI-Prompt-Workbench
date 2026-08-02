@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_danbooru_update.ps1"
set "exit_code=%ERRORLEVEL%"
echo.
if not "%exit_code%"=="0" echo The update did not complete. Check the message above.
pause
exit /b %exit_code%
