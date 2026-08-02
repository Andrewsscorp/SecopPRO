@echo off
echo Iniciando SecopPRO...
echo.
echo Iniciando Backend (FastAPI)...
start "SecopPRO Backend" cmd /k "cd backend && python -m uvicorn main:app --reload --port 8000"

echo Iniciando Frontend (Next.js)...
start "SecopPRO Frontend" cmd /k "cd frontend && call npm run dev"

echo.
echo ====================================================
echo  El sistema se esta iniciando en 2 ventanas nuevas.
echo  Por favor, no las cierres mientras uses el sistema.
echo ====================================================
pause
