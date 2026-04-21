@echo off
setlocal enabledelayedexpansion

echo 🤖 AI-ish Auto Commit & Version Bump...

:: 1. เลือกประเภทการอัปเดต (patch, minor, major) - default เป็น patch
set "bump_type=patch"
if "%~1"=="minor" set "bump_type=minor"
if "%~1"=="major" set "bump_type=major"

:: 2. ตรวจสอบการเปลี่ยนแปลง
git status --short > temp_status.txt
set /p status_check=<temp_status.txt
if "!status_check!"=="" (
    echo ℹ️ No changes detected.
    del temp_status.txt
    pause
    exit /b
)

:: 3. สรุปไฟล์ที่เปลี่ยนสำหรับ Commit Message
set "filelist="
for /f "tokens=2" %%i in (temp_status.txt) do (
    set "filelist=!filelist! %%i,"
)
del temp_status.txt

:: 4. ทำการ Bump Version ใน package.json
echo 📦 Bumping version (%bump_type%)...
call npm version %bump_type% --no-git-tag-version

:: 5. เตรียม Commit Message (สรุปสิ่งทึ่แก้)
echo 📝 Generating commit message...
:: หากใช้ผ่าน Antigravity ผมจะช่วยเขียนสรุปในขั้นตอนนี้ครับ
:: แต่สำหรับ script จะใช้ list ของไฟล์ที่แก้เป็นพื้นฐาน
set "commit_msg=chore: bump version and update items [!filelist!]"

:: 6. Git Operations
git add .
git commit -m "%commit_msg%"

echo.
echo --- Pushing to GitHub ---
git push origin main

echo.
echo ✅ Successfully updated to version:
for /f "tokens=2 delims=:, " %%a in ('findstr "version" package.json') do set "new_ver=%%~a"
echo v!new_ver!
echo.
echo Message: %commit_msg%
pause
