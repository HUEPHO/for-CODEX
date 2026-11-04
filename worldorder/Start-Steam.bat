@echo off
setlocal
cd /d "%~dp0"
if exist "runtime\node.exe" (
  "runtime\node.exe" "scripts\start-steam.mjs"
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js is missing. Use the portable World Order Steam package.
    pause
    exit /b 1
  )
  node "scripts\start-steam.mjs"
)
if errorlevel 1 pause
