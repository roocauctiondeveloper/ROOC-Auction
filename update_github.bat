@echo off
set /p msg="Enter Commit Message: "
git add .
git commit -m "%msg%"
git push origin main
echo.
echo === Update GitHub Complete! ===
pause
