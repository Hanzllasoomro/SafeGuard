#!/usr/bin/env bash
# SafeGuard AI -- One-click startup script for Linux/macOS

set -e

echo "============================================"
echo "  SafeGuard AI -- Starting Up"
echo "============================================"
echo ""

# Determine python command
PYTHON=python3
if ! command -v python3 &>/dev/null; then
    PYTHON=python
fi

# Activate venv if it exists
VENV_ACTIVATE="backend/venv/bin/activate"
if [ -f "" ]; then
    echo "[BACKEND] Activating venv..."
    # shellcheck disable=SC1090
    source ""
    PYTHON=python
fi

# Start backend in background
echo "[BACKEND] Starting FastAPI on http://localhost:8000 ..."
(cd backend &&  -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload) &
BACKEND_PID=$!

# Give backend a moment to start
sleep 2

# Start frontend in background
echo "[FRONTEND] Starting Vite on http://localhost:5173 ..."
(cd frontend && npm run dev) &
FRONTEND_PID=$!

echo ""
echo "============================================"
echo "  Both servers are running!"
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo "  API Docs: http://localhost:8000/docs"
echo "  Press Ctrl+C to stop both servers."
echo "============================================"
echo ""

# Wait for either process to exit, then kill both
trap "kill   2>/dev/null; exit" INT TERM
wait  
