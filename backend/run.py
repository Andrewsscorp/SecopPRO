import sys
import asyncio
import uvicorn
from core.setup import ensure_immutable_directories

# Configurar el sistema de archivos sagrado
ensure_immutable_directories()

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

if __name__ == "__main__":
    print("Iniciando Motor Backend de SecopPRO (Soporte Playwright Activado)...")
    # loop="none" es LA CLAVE: Evita que Uvicorn sobrescriba nuestra política ProactorEventLoop en Windows.
    config = uvicorn.Config("main:app", host="0.0.0.0", port=8000, loop="none")
    server = uvicorn.Server(config)
    
    # Iniciar servidor dentro del loop correcto
    asyncio.run(server.serve())
