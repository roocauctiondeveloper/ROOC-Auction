@echo off
setlocal enabledelayedexpansion

echo 🤖 AI-ish Auto Commit is checking your changes...

:: 1. ดึงรายชื่อไฟล์ที่ถูกแก้ไขมาต่อกันเป็นบรรทัดเดียว
set "filelist="
for /f "tokens=*" %%i in ('git status --short') do (
    set "line=%%i"
    set "filelist=!filelist! !line!"
)

if "%filelist%"=="" (
    echo ℹ️ No changes detected. Nothing to update!
    pause
    exit /b
)

:: 2. ตั้งชื่อบันทึกตามไฟล์ที่แก้
set "commit_msg=Auto-update items: %filelist%"

:: 3. รันระบบทั้งหมด
git add .
git commit -m "%commit_msg%"

echo.
echo --- Pushing to GitHub (Render will sync automatically) ---
git push origin main

echo.
echo ✅ Successfully updated with message: 
echo "%commit_msg%"
pause
