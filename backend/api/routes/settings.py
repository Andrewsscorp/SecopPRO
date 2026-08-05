from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
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

class DownloadQwenData(BaseModel):
    mode: str
    url: str = ""

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

    # Tomar solo la primera llave para el test de conexión en caso de que hayan configurado múltiples (separadas por comas)
    key_to_use = [k.strip() for k in key_to_use.split(",") if k.strip()][0]

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

def download_file_background_sync(url: str, dest_path: str):
    import httpx
    import os
    try:
        with httpx.Client(verify=False, follow_redirects=True) as client:
            with client.stream("GET", url) as response:
                response.raise_for_status()
                with open(dest_path + ".tmp", "wb") as f:
                    for chunk in response.iter_bytes(chunk_size=8192*8):
                        if chunk:
                            f.write(chunk)
        if os.path.exists(dest_path + ".tmp"):
            os.replace(dest_path + ".tmp", dest_path)
    except Exception as e:
        print(f"Error descargando {url}: {e}")

@router.post("/download-qwen")
async def download_qwen(data: DownloadQwenData, background_tasks: BackgroundTasks):
    """
    Inicia la descarga de Qwen 2.5 localmente de manera real.
    """
    default_url = "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf?download=true"
    url_to_download = data.url if data.mode == "manual" and data.url else default_url
    
    models_dir = os.path.join("C:\\", "SecopPRO", "Models")
    os.makedirs(models_dir, exist_ok=True)
    model_path = os.path.join(models_dir, "qwen2.5-3b-instruct-q4_k_m.gguf")
    
    if os.path.exists(model_path):
        return {"status": "success", "message": "El modelo ya está instalado.", "url_used": url_to_download}
        
    background_tasks.add_task(download_file_background_sync, url_to_download, model_path)
    return {"status": "success", "message": "Iniciando descarga real de Qwen 2.5...", "url_used": url_to_download}

@router.get("/download-progress")
async def get_download_progress():
    models_dir = os.path.join("C:\\", "SecopPRO", "Models")
    model_path = os.path.join(models_dir, "qwen2.5-3b-instruct-q4_k_m.gguf")
    tmp_path = model_path + ".tmp"
    
    TOTAL_BYTES = 2400000000 # ~2.2 GB para Qwen 3B Q4_K_M
    
    if os.path.exists(model_path):
        return {"status": "success", "progress": 100}
    
    if os.path.exists(tmp_path):
        current_bytes = os.path.getsize(tmp_path)
        prog = (current_bytes / TOTAL_BYTES) * 100
        return {"status": "success", "progress": min(prog, 99.9)}
        
    return {"status": "success", "progress": 0}

@router.get("/qwen-status")
async def get_qwen_status():
    models_dir = os.path.join("C:\\", "SecopPRO", "Models")
    os.makedirs(models_dir, exist_ok=True)
    model_name = "qwen2.5-3b-instruct-q4_k_m.gguf"
    model_path = os.path.join(models_dir, model_name)
    
    is_downloaded = os.path.exists(model_path)
    
    return {
        "status": "success",
        "is_downloaded": is_downloaded,
        "path": model_path
    }

class PingQwenData(BaseModel):
    prompt: str = "Hola, ¿estás en SecopPRO?"

@router.post("/ping-qwen")
async def ping_qwen(data: PingQwenData):
    models_dir = os.path.join("C:\\", "SecopPRO", "Models")
    model_path = os.path.join(models_dir, "qwen2.5-3b-instruct-q4_k_m.gguf")
    
    if not os.path.exists(model_path):
        raise HTTPException(status_code=404, detail=f"Modelo no encontrado en {model_path}")
        
    try:
        import time
        import subprocess
        start_time = time.time()
        
        # Motor nativo precompilado
        engine_path = os.path.join("C:\\", "SecopPRO", "Engine", "llama-cli.exe")
        if not os.path.exists(engine_path):
            raise HTTPException(status_code=500, detail="Motor nativo (llama-cli.exe) no encontrado. La instalación del motor falló.")
            
        prompt_formatted = f"<|im_start|>system\nEres el asistente IA integrado en SecopPRO.<|im_end|>\n<|im_start|>user\n{data.prompt}<|im_end|>\n<|im_start|>assistant\n"
        
        prompt_file = os.path.join("C:\\", "SecopPRO", "Engine", "temp_prompt.txt")
        with open(prompt_file, "w", encoding="utf-8") as f:
            f.write(prompt_formatted)
            
        cmd = [
            engine_path,
            "-m", model_path,
            "-f", prompt_file,
            "-n", "50",
            "-c", "256",
            "--log-disable"
        ]
        
        # 0x08000000 = CREATE_NO_WINDOW
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="ignore", creationflags=0x08000000)
        
        end_time = time.time()
        
        # Windows agrega \r\n, por lo que limpiamos la salida
        raw_output = result.stdout
        
        # Eliminar el prompt de la salida de forma segura. llama-cli filtra los tokens especiales.
        response_text = raw_output
        if "\nassistant" in response_text:
            response_text = response_text.split("\nassistant")[-1].strip()
        elif "<|im_start|>assistant" in response_text:
            response_text = response_text.split("<|im_start|>assistant")[-1].strip()
            
        # Limpiar palabras extrañas que a veces deja llama-cli
        if response_text.startswith("aquí estoy") or response_text.startswith("aqu"):
             # It's fine, just leave it, or maybe clean up prompt bleed
             pass
        
        # Si sigue vacío o tiene caracteres raros
        if not response_text or "RAW:" in response_text:
            response_text = "(El motor generó una respuesta vacía)"
            
        return {
            "status": "success",
            "response": response_text,
            "latency_ms": int((end_time - start_time) * 1000)
        }
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Error durante inferencia nativa: {str(e)}")

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
