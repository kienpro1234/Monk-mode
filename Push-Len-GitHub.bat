@echo off
chcp 65001 >nul
title Push Du An Len Nui (Monk Mode) len GitHub
cd /d "%~dp0"

echo ==============================================================
echo   DANG DAY DU AN "LEN NUI (MONK MODE)" LEN GITHUB...
echo   Repo: https://github.com/kienpro1234/Monk-mode.git
echo ==============================================================
echo.

set "GIT_EXE=D:\Git\cmd\git.exe"
if not exist "%GIT_EXE%" set "GIT_EXE=git"

"%GIT_EXE%" add .
"%GIT_EXE%" commit -m "chore: Update Len Nui (Ascend the Mountain) Desktop App" 2>nul
"%GIT_EXE%" branch -M main

echo [1/2] Dang ket noi va day code len nhanh main...
"%GIT_EXE%" push -u origin main

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] Token GitHub cu trong Windows Credential Manager da het han hoac sai.
    echo [2/2] Dang xoa token cu de mo cua so dang nhap GitHub moi trên trinh duyet...
    cmdkey /delete:git:https://github.com >nul 2>&1
    cmdkey /delete:LegacyGeneric:target=git:https://github.com >nul 2>&1
    echo.
    echo Vui long bam "Sign in with your browser" trong cua so GitHub hien len!
    "%GIT_EXE%" push -u origin main
)

echo.
echo ==============================================================
echo   HOAN TAT! Ban co the kiem tra tai:
echo   https://github.com/kienpro1234/Monk-mode
echo ==============================================================
pause
