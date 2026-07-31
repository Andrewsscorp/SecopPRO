@echo off
color 0A
echo ========================================================
echo               INICIANDO SECOP PRO MOTOR
echo ========================================================
echo.

echo [1] Levantando Servidor Backend (FastAPI)...
start "SecopPRO Backend" cmd /k "cd backend && python run.py"

echo [2] Levantando Interfaz Visual (Next.js)...
start "SecopPRO Frontend" cmd /k "cd frontend && npm run dev"

echo [3] Esperando a que los motores arranquen...
timeout /t 6 >nul

echo [4] Abriendo el Dashboard en tu navegador...
start http://localhost:3000

echo.
echo Listo! Si en algun momento el Scraper necesita tu ayuda
echo con el ReCaptcha, la ventana de Chrome saltara desde 
echo la consola del Backend. No cierres estas ventanas negras.
echo.
pause
