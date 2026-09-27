@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\service.ps1" start
if errorlevel 1 (pause & exit /b 1)
start "" http://127.0.0.1:18890/
