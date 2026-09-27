@echo off
cd /d "%~dp0"
set "NODE=%USERPROFILE%\.openclaw\runtime\node-v26.10.0\node.exe"
if exist "%NODE%" goto localnode
node scripts\setup.mjs
goto end
:localnode
"%NODE%" scripts\setup.mjs
:end
pause
