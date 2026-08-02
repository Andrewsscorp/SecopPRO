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
from api.routes import analyzer, dashboard, export, settings, ai, contractor, pdf_ai

# Inicializar Base de datos en C:/SecopPRO/Database/database.sqlite
Base.metadata.create_all(bind=engine)

app = FastAPI(title="SecopPRO API")

from database.database import SessionLocal
from database.models import ClavesDesarrollo
from core.security import encrypt_data

@app.on_event("startup")
async def startup_event():
    db = SessionLocal()
    try:
        if db.query(ClavesDesarrollo).count() == 0:
            clave_enc = encrypt_data("Su4r3z2603/*-")
            nueva_clave = ClavesDesarrollo(clave_encriptada=clave_enc)
            db.add(nueva_clave)
            db.commit()
            print("Clave de desarrollo inyectada con exito.")
    except Exception as e:
        print(f"Error inicializando claves: {e}")
    finally:
        db.close()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyzer.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api/dashboard")
app.include_router(export.router, prefix="/api/export")
app.include_router(settings.router, prefix="/api/settings")
app.include_router(ai.router, prefix="/api/ai")
app.include_router(contractor.router, prefix="/api/contractor")
app.include_router(pdf_ai.router, prefix="/api/pdf")
