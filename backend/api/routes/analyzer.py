from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import asyncio
import uuid
import json
import io
import hashlib
import multiprocessing as mp
import threading
import pandas as pd

from api.schemas import StartAnalysisResponse
from workers.secop_worker import worker_process_entrypoint
from database.database import get_db
from database.models import ContratoAnalisis, CacheSecop, AnalisisRealizado

router = APIRouter()

active_queues = {}
active_processes = {}

@router.post("/cancel/{job_id}")
def cancel_analysis(job_id: str):
    if job_id in active_processes:
        process = active_processes[job_id]
        if process.is_alive():
            process.terminate()
            process.join(timeout=2)
        
        if job_id in active_queues:
            loop = asyncio.get_event_loop()
            asyncio.run_coroutine_threadsafe(
                active_queues[job_id].put({"type": "error", "message": "[CANCELADO] El proceso fue asesinado por el usuario de forma segura (PID Killed)."}),
                loop
            )
            
    return {"message": "Señal SIGTERM enviada al PID del motor."}

def process_queue_reader(mp_queue, async_queue, loop):
    while True:
        try:
            msg = mp_queue.get()
            asyncio.run_coroutine_threadsafe(async_queue.put(msg), loop)
            if msg.get("type") in ("complete", "error"):
                break
        except Exception:
            break

@router.get("/next-audit-name")
def get_next_audit_name(db: Session = Depends(get_db)):
    import re
    nombres = db.query(AnalisisRealizado.nombre_analisis).filter(
        AnalisisRealizado.nombre_analisis.like("SECOP Auditoría %")
    ).all()
    
    max_num = 0
    pattern = re.compile(r"^SECOP Auditoría (\d+)$")
    for (nombre,) in nombres:
        if nombre:
            match = pattern.match(nombre)
            if match:
                num = int(match.group(1))
                if num > max_num:
                    max_num = num
                    
    next_num = max_num + 1
    return {"next_name": f"SECOP Auditoría {next_num:02d}"}

@router.post("/check_cache")
async def check_cache(
    file: UploadFile = File(...),
    payload: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        config_data = json.loads(payload)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="El payload no es un JSON válido")
        
    mapped_columns = config_data.get('mappedColumns', [])
    key_mapping = next((col for col in mapped_columns if col.get('isKey')), None)
    
    if not key_mapping:
        raise HTTPException(status_code=400, detail="No se seleccionó Llave Primaria en la configuración.")
        
    excel_col = key_mapping['excelCol']
    
    file_bytes = await file.read()
    
    # Calcular SHA256
    sha256 = hashlib.sha256(file_bytes).hexdigest()
    
    try:
        df = pd.read_excel(io.BytesIO(file_bytes))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo leer el Excel: {e}")
        
    if excel_col not in df.columns:
        raise HTTPException(status_code=400, detail=f"La columna '{excel_col}' no existe en el Excel.")
        
    valores_buscar = df[excel_col].dropna().astype(str).unique().tolist()
    total_buscar = len(valores_buscar)
    
    # Buscar en caché de datos
    cached_count = db.query(CacheSecop).filter(CacheSecop.llave_busqueda.in_(valores_buscar)).count()
    
    # Buscar en bóveda global de PDFs
    from database.models import PDFsConsulta
    cached_pdfs_count = db.query(PDFsConsulta).filter(PDFsConsulta.llave_busqueda.in_(valores_buscar)).count()
    
    return {
        "total_count": total_buscar,
        "cached_count": cached_count,
        "cached_pdfs_count": cached_pdfs_count,
        "sha256": sha256,
        "nombre_archivo": file.filename
    }

@router.post("/start", response_model=StartAnalysisResponse)
async def start_analysis(
    file: UploadFile = File(...),
    payload: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        config_data = json.loads(payload)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="El payload no es un JSON válido")
        
    import re
    analysis_config = config_data.get('analysisConfig', {})
    raw_name = analysis_config.get('name', '').strip()
    if not raw_name:
        raise HTTPException(status_code=400, detail="El nombre del análisis es requerido.")
        
    # Verificar si el nombre ya existe
    existe = db.query(AnalisisRealizado).filter(AnalisisRealizado.nombre_analisis == raw_name).first()
    if existe:
        raise HTTPException(status_code=400, detail=f"El nombre '{raw_name}' ya está en uso. Por favor, elige otro o borra el anterior.")
    
    # Hacer el job_id único agregándole un UUID para no colisionar internamente
    job_id = re.sub(r'[\\/*?:"<>|]', '_', raw_name).replace(' ', '_') + "_" + str(uuid.uuid4())[:6]
    
    active_queues[job_id] = asyncio.Queue()
    mp_queue = mp.Queue()
    
    file_bytes = await file.read()
    
    process = mp.Process(target=worker_process_entrypoint, args=(job_id, config_data, file_bytes, mp_queue))
    process.start()
    
    active_processes[job_id] = process
    
    loop = asyncio.get_running_loop()
    threading.Thread(target=process_queue_reader, args=(mp_queue, active_queues[job_id], loop), daemon=True).start()
    
    return {"job_id": job_id, "message": f"Análisis iniciado en proceso PID: {process.pid}"}

@router.get("/stream/{job_id}")
async def stream_progress(job_id: str):
    if job_id not in active_queues:
        raise HTTPException(status_code=404, detail="Job ID no encontrado o ya expiró")
        
    queue = active_queues[job_id]

    async def event_generator():
        try:
            while True:
                message = await queue.get()
                yield f"data: {json.dumps(message)}\n\n"
                if message.get("type") in ("complete", "error"):
                    break
        finally:
            if job_id in active_queues:
                del active_queues[job_id]

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/contratos")
def get_contratos(job_id: str = None, db: Session = Depends(get_db)):
    query = db.query(ContratoAnalisis)
    if job_id:
        query = query.filter(ContratoAnalisis.id_analisis == job_id)
    
    contratos = query.order_by(ContratoAnalisis.id.desc()).limit(100).all()
    return contratos
