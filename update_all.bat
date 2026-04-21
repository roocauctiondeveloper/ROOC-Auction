@echo off
set /p msg="Enter Commit Message: "
git add .
git commit -m "%msg%"
echo.
echo --- Pushing to GitHub ---
git push origin main
echo.
echo --- Pushing to Hugging Face ---
git push hf main
echo.
echo === Update ALL Complete! ===
pause
