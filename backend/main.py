import sys
import asyncio

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import os
import pathlib
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# --- INICIALIZACIÓN DEL MOTOR DE SISTEMA (C:\SecopPRO) ---
SECOP_ROOT = pathlib.Path("C:/SecopPRO")
DB_DIR = SECOP_ROOT / "Database"
CONFIG_DIR = SECOP_ROOT / "Config"
JSON_DIR = SECOP_ROOT / "Json"

def initialize_system():
    print("Inicializando Motor SecopPRO en C:/...")
    for directory in [DB_DIR, CONFIG_DIR, JSON_DIR]:
        directory.mkdir(parents=True, exist_ok=True)

# Crear directorios antes de importar SQLAlchemy
initialize_system()

from database.database import engine, Base
from api.routes import analyzer, dashboard, export, settings, ai

# Inicializar Base de datos en C:/SecopPRO/Database/database.sqlite
Base.metadata.create_all(bind=engine)

app = FastAPI(title="SecopPRO API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyzer.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api/dashboard")
app.include_router(export.router, prefix="/api/export")
app.include_router(settings.router, prefix="/api/settings")
app.include_router(ai.router, prefix="/api/ai")
