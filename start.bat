@echo off
title SafeGuard AI

echo ============================================
echo   SafeGuard AI -- Starting Up
echo ============================================
echo.

REM Check if backend venv exists
if exist "backend\venv\Scripts\activate.bat" (
    echo [BACKEND] Using virtual environment at backend\venv
    start "SafeGuard Backend" cmd /k "cd /d backend && call venv\Scripts\activate && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
) else (
    echo [BACKEND] No venv found, using system/active Python
    start "SafeGuard Backend" cmd /k "cd /d backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
)

echo [BACKEND] Starting on http://localhost:8000
timeout /t 3 /nobreak >nul

echo [FRONTEND] Starting Vite dev server...
start "SafeGuard Frontend" cmd /k "cd /d frontend && npm run dev"

echo.
echo ============================================
echo   Both servers are starting!
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:5173
echo   API Docs: http://localhost:8000/docs
echo ============================================
echo.
echo This window can be closed.
pause
