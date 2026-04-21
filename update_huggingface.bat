@echo off
set /p msg="Enter Commit Message: "
git add .
git commit -m "%msg%"
git push hf main
echo.
echo === Update Hugging Face Complete! ===
pause
