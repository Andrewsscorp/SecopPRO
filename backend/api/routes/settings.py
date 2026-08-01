from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Dict, Any
from sqlalchemy.orm import Session
import httpx
import json

from database.database import get_db
from database.models import ConfiguracionAPI, ClavesDesarrollo
from core.security import encrypt_data, decrypt_data
import os
import subprocess

router = APIRouter()

class APIKeyData(BaseModel):
    provider: str
    api_key: str
    model: str
    is_active: bool

class TestConnectionData(BaseModel):
    provider: str
    api_key: str

@router.post("/keys")
async def update_keys(data: APIKeyData, db: Session = Depends(get_db)):
    # Solo actualizar la llave si nos mandaron algo; 
    # de lo contrario, podrían estar solo guardando el modelo/estado.
    # Pero el frontend siempre manda el input actual. Si está vacío, puede no haber cambiado si no la han revelado?
    # Para ser exactos: el front siempre nos manda api_key, si es vacía, significa que no quisieron actualizarla a menos que la llave no existiese.
    
    config = db.query(ConfiguracionAPI).filter(ConfiguracionAPI.proveedor == data.provider).first()
    
    if not config:
        # Nuevo
        if not data.api_key:
            raise HTTPException(status_code=400, detail="Debes proporcionar una clave API inicial.")
            
        config = ConfiguracionAPI(
            proveedor=data.provider,
            api_key_encriptada=encrypt_data(data.api_key),
            modelo=data.model,
            is_active=1 if data.is_active else 0
        )
        db.add(config)
    else:
        # Update
        if data.api_key: # solo reencriptar si enviaron un string
            config.api_key_encriptada = encrypt_data(data.api_key)
        config.modelo = data.model
        config.is_active = 1 if data.is_active else 0
        
    db.commit()
    return {"status": "success", "message": f"Configuración guardada para {data.provider}"}

@router.get("/keys")
async def get_keys(db: Session = Depends(get_db)):
    configs = db.query(ConfiguracionAPI).all()
    
    result = {}
    for c in configs:
        real_key = ""
        if c.api_key_encriptada:
            real_key = decrypt_data(c.api_key_encriptada)
                
        result[c.proveedor] = {
            "model": c.modelo,
            "is_active": bool(c.is_active),
            "configured": True if c.api_key_encriptada else False,
            "api_key_real": real_key
        }
        
    return {"status": "success", "data": result}

@router.post("/test-connection")
async def test_connection(data: TestConnectionData, db: Session = Depends(get_db)):
    """
    Intenta un request básico enviando un 'hola'.
    """
    key_to_use = data.api_key
    
    # Si la key enviada es la enmascarada, buscamos la real en la BD
    if key_to_use and "•" in key_to_use:
        config = db.query(ConfiguracionAPI).filter(ConfiguracionAPI.proveedor == data.provider).first()
        if config and config.api_key_encriptada:
            key_to_use = decrypt_data(config.api_key_encriptada)
    
    if not key_to_use:
        raise HTTPException(status_code=400, detail="Key no proporcionada para test.")

    try:
        if data.provider == "groq":
            from groq import Groq
            client = Groq(api_key=key_to_use, http_client=httpx.Client(verify=False))
            # Test enviando "Hola"
            chat_completion = client.chat.completions.create(
                messages=[{"role": "user", "content": "Hola, esto es una prueba de conexión."}],
                model="llama-3.1-8b-instant",
                max_tokens=10
            )
            if chat_completion.choices:
                return {"status": "success"}
            else:
                raise HTTPException(status_code=401, detail="API Key inválida para Groq")
        elif data.provider == "gemini":
            # Para gemini igual se puede hacer una prueba básica
            with httpx.Client(verify=False) as client:
                res = client.get(
                    f"https://generativelanguage.googleapis.com/v1beta/models?key={key_to_use}",
                    timeout=10.0
                )
                if res.status_code == 200:
                    return {"status": "success"}
                else:
                    raise HTTPException(status_code=401, detail="API Key inválida para Gemini")
        else:
            raise HTTPException(status_code=400, detail="Proveedor desconocido.")
            
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Error de conexión: {repr(e)}")

@router.delete("/keys/{provider}")
async def delete_key(provider: str, db: Session = Depends(get_db)):
    config = db.query(ConfiguracionAPI).filter(ConfiguracionAPI.proveedor == provider).first()
    if not config:
        raise HTTPException(status_code=404, detail="La configuración no existe")
        
    db.delete(config)
    db.commit()
    return {"status": "success", "message": f"API de {provider} eliminada permanentemente"}

@router.get("/ping")
async def ping():
    return {"status": "ok"}

class RestartData(BaseModel):
    password: str

@router.post("/restart-system")
async def restart_system(data: RestartData, db: Session = Depends(get_db)):
    import sys
    clave_db = db.query(ClavesDesarrollo).first()
    if not clave_db:
        raise HTTPException(status_code=500, detail="No hay clave de desarrollo configurada en el sistema.")
        
    clave_real = decrypt_data(clave_db.clave_encriptada)
    if data.password != clave_real:
        raise HTTPException(status_code=401, detail="Clave de desarrollador incorrecta.")
        
    # Crear el script de reinicio forzado en Python multiplataforma
    py_content = """import os
import sys
import time
import psutil
import subprocess

time.sleep(2)

def is_docker():
    path = '/proc/self/cgroup'
    return (
        os.path.exists('/.dockerenv') or
        (os.path.isfile(path) and any('docker' in line for line in open(path)))
    )

def kill_ports(ports):
    pids_to_kill = set()
    for conn in psutil.net_connections():
        if conn.laddr.port in ports:
            pids_to_kill.add(conn.pid)
            
    for pid in pids_to_kill:
        try:
            p = psutil.Process(pid)
            p.terminate()
        except:
            pass

    if sys.platform == 'win32':
        # Limpiar ventanas cmd viejas para que no se acumulen
        os.system('taskkill /F /FI "WINDOWTITLE eq SecopPRO*" /T >nul 2>&1')

kill_ports([8000, 3000])
time.sleep(2)

if is_docker():
    pass # Docker reiniciará el contenedor automáticamente
elif sys.platform == 'win32':
    bat_path = r"C:\\Users\\Hawk\\Documents\\secoppro\\iniciar_sistema.bat"
    if os.path.exists(bat_path):
        subprocess.Popen(
            ["cmd.exe", "/c", bat_path], 
            cwd=r"C:\\Users\\Hawk\\Documents\\secoppro",
            creationflags=0x08000000
        )
else:
    sh_path = os.path.join(os.getcwd(), "iniciar_sistema.sh")
    if os.path.exists(sh_path):
        subprocess.Popen(["sh", sh_path], start_new_session=True)

try:
    os.remove(__file__)
except:
    pass
"""
    py_path = r"C:\Users\Hawk\Documents\secoppro\reinicio_forzado.py"
    try:
        with open(py_path, "w", encoding="utf-8") as f:
            f.write(py_content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creando script de reinicio: {e}")
        
    # Lanzar de forma asincrona y desapegada
    if sys.platform == 'win32':
        subprocess.Popen(
            [sys.executable, py_path],
            cwd=r"C:\Users\Hawk\Documents\secoppro",
            creationflags=0x08000000
        )
    else:
        subprocess.Popen(
            [sys.executable, py_path],
            cwd=r"C:\Users\Hawk\Documents\secoppro",
            start_new_session=True
        )
    
    return {"status": "success", "message": "Reiniciando servidores..."}
