@echo off
set /p msg="Enter Commit Message: "
git add .
git commit -m "%msg%"
echo.
echo --- Pushing to GitHub ---
git push origin main
echo.
echo === Update Complete! ===
pause
