import sys
import asyncio
import uvicorn
import os
import subprocess
from core.setup import ensure_immutable_directories

def kill_process_on_port(port: int):
    """Busca cualquier proceso que esté ocupando el puerto y lo mata a la fuerza (Windows)"""
    try:
        result = subprocess.check_output(f'netstat -ano | findstr :{port}', shell=True).decode()
        for line in result.splitlines():
            if 'LISTENING' in line:
                parts = line.strip().split()
                pid = parts[-1]
                if pid != '0':
                    print(f"[*] Limpiando puerto {port} (Matando PID {pid} zombie)...")
                    os.system(f'taskkill /F /PID {pid} >nul 2>&1')
    except Exception:
        pass # No había ningún proceso escuchando

# Configurar el sistema de archivos sagrado
ensure_immutable_directories()

if __name__ == "__main__":
    PORT = 8000
    kill_process_on_port(PORT)
    
    print("Iniciando Motor Backend de SecopPRO (Soporte Playwright Activado)...")
    config = uvicorn.Config("main:app", host="0.0.0.0", port=PORT, loop="asyncio")
    server = uvicorn.Server(config)
    
    # Iniciar servidor
    asyncio.run(server.serve())
