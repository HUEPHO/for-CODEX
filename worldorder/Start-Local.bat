@echo off
setlocal
cd /d "%~dp0"
if exist "runtime\node.exe" (
  "runtime\node.exe" "scripts\launch-local.mjs"
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js is missing. Use the full World Order handoff package.
    pause
    exit /b 1
  )
  node "scripts\launch-local.mjs"
)
if errorlevel 1 pause
