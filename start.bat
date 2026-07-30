@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo XATO: Node.js topilmadi.
    echo Iltimos avval https://nodejs.org dan Node.js ni o'rnating ^(LTS versiyani^), keyin bu faylni qayta ishga tushiring.
    pause
    exit /b 1
)

where ffmpeg >nul 2>nul
if errorlevel 1 (
    echo XATO: FFmpeg topilmadi yoki PATH'ga qo'shilmagan.
    echo README.md faylidagi FFmpeg o'rnatish bo'limiga qarang.
    pause
    exit /b 1
)

echo Dashboard ishga tushmoqda...
start "" "http://localhost:3000"
node server.js
pause
