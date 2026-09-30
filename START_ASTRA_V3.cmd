@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ASTRA v3
set "PY="
if exist "runtime\python.exe" set "PY=runtime\python.exe"
if not defined PY (py -3 --version >nul 2>&1 && set "PY=py -3")
if not defined PY (python --version >nul 2>&1 && set "PY=python")
if not defined PY (
  echo [ASTRA] Python 3.10 이상이 필요합니다. python.org 에서 설치 후 다시 실행하세요.
  echo         설치 화면에서 "Add python.exe to PATH"를 꼭 체크하세요.
  pause
  exit /b 1
)
if not exist "private\corpus.sqlite" (
  echo [ASTRA] 처음 실행: 시연 데이터를 설치합니다...
  %PY% setup_data.py
  if errorlevel 1 ( pause & exit /b 1 )
)
echo [ASTRA] 서버를 시작합니다. 이 창을 닫으면 ASTRA가 종료됩니다.
%PY% launch.py
if errorlevel 1 pause
