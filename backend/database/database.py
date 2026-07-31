import os
import pathlib
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Asegurar creación del directorio por si se importa directamente
db_dir = pathlib.Path("C:/SecopPRO/Database")
db_dir.mkdir(parents=True, exist_ok=True)

# Configuración SQLite Enterprise (Motor C:)
DATABASE_URL = "sqlite:///C:/SecopPRO/Database/database.sqlite"

# check_same_thread=False es necesario en SQLite para manejar peticiones en distintos hilos por FastAPI
engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    """Dependencia para la inyección de la base de datos en las rutas"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
