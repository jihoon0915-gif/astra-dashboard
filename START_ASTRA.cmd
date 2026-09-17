@echo off
cd /d "%~dp0"
if exist "runtime\python.exe" (
  "runtime\python.exe" launch.py
) else (
  py -3 launch.py
)
if errorlevel 1 pause
