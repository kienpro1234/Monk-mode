@echo off
chcp 65001 >nul
title LÊN NÚI (ASCEND THE MOUNTAIN) - Desktop App
cd /d "%~dp0"
echo =====================================================================
echo   LÊN NÚI (ASCEND THE MOUNTAIN) - HỆ THỐNG TU LUYỆN DESKTOP (V2.0)
echo =====================================================================
echo.
echo [1/2] Đang cập nhật giao diện 4-Trong-1 ^& Tàng Kinh Các...
"C:\Program Files\nodejs\node.exe" "scripts\build.mjs"
echo [2/2] Đang khởi động OS Engine và mở cửa sổ Desktop App...
"C:\Program Files\nodejs\node.exe" "scripts\desktop-server.mjs"
if %errorlevel% neq 0 (
  echo.
  echo Đang chuyển sang chế độ mở trực tiếp cửa sổ Desktop App...
  call "%~dp0Mo-Ngay-App-Khong-Can-Server.bat"
)
