@echo off
setlocal
cd /d "%~dp0"
echo World Order local table: http://127.0.0.1:8787
if exist "runtime\node.exe" (
  "runtime\node.exe" "scripts\dev-local.mjs"
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js is missing. Use the full World Order handoff package.
    pause
    exit /b 1
  )
  node "scripts\dev-local.mjs"
)
if errorlevel 1 pause
