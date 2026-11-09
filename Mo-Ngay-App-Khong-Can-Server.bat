@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app="file:///D:/App/Monk%%20app/dist/index.html?v=%RANDOM%" --user-data-dir="%~dp0data\desktop-window-profile" --window-size=1440,920 --no-first-run --no-default-browser-check
  exit /b 0
)
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
  start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app="file:///D:/App/Monk%%20app/dist/index.html?v=%RANDOM%" --user-data-dir="%~dp0data\desktop-window-profile" --window-size=1440,920 --no-first-run --no-default-browser-check
  exit /b 0
)
start "" "%~dp0dist\index.html"
