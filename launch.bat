@echo off
cd /d "%~dp0"
start "PulseProxy UI Server" /min node ./node_modules/vite/bin/vite.js --port 1420
timeout /t 1 /nobreak >nul
if exist "PulseProxy.exe" (
    start "" "PulseProxy.exe"
) else (
    start "" "http://localhost:1420"
)
