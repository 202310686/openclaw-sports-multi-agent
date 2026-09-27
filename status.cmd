@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\service.ps1" status
pause
