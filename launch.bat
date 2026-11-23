@echo off
cd /d "%~dp0"
taskkill /F /IM PulseProxy.exe >nul 2>&1
netstat -ano | findstr ":1420 " >nul 2>&1
if errorlevel 1 (
    start "PulseProxy UI Server" /min node ./node_modules/vite/bin/vite.js --port 1420
    timeout /t 2 /nobreak >nul
)
start "" "%~dp0PulseProxy.exe"
