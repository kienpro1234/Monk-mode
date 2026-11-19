@echo off
cd /d "%~dp0"
if exist "%~dp0dist\app.bundle.js" goto RUN_SILENT
if exist "C:\Program Files\nodejs\node.exe" goto BUILD_ABS
node "%~dp0scripts\build.mjs"
goto RUN_SILENT
:BUILD_ABS
"C:\Program Files\nodejs\node.exe" "%~dp0scripts\build.mjs"
:RUN_SILENT
start "" wscript.exe "%~dp0Mo-App-Khong-Can-CMD.vbs"
exit /b 0
