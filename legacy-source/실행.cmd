@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 demo-ui/spatial-poc/integrated_server.py --generator disconnected --port 8769
) else (
  python demo-ui/spatial-poc/integrated_server.py --generator disconnected --port 8769
)
pause
