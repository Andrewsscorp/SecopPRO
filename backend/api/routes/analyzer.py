from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import StreamingResponse
import asyncio
import uuid
import json
import multiprocessing as mp
import threading
from api.schemas import StartAnalysisResponse
from workers.secop_worker import worker_process_entrypoint
from sqlalchemy.orm import Session
from database.database import get_db
from database.models import Contrato

router = APIRouter()

# Diccionario global en memoria para guardar las colas asíncronas de cada job_id
active_queues = {}
# Diccionario global para mantener referencia a los subprocesos vivos
active_processes = {}

@router.post("/cancel/{job_id}")
def cancel_analysis(job_id: str):
    if job_id in active_processes:
        process = active_processes[job_id]
        if process.is_alive():
            process.terminate()
            process.join(timeout=2)
        
        # Enviar señal artificial a la cola para desconectar clientes SSE
        if job_id in active_queues:
            loop = asyncio.get_event_loop()
            asyncio.run_coroutine_threadsafe(
                active_queues[job_id].put({"type": "error", "message": "[CANCELADO] El proceso fue asesinado por el usuario de forma segura (PID Killed)."}),
                loop
            )
            
    return {"message": "Señal SIGTERM enviada al PID del motor."}

def process_queue_reader(mp_queue, async_queue, loop):
    """Hilo puente que lee de la cola sincrónica del PID y empuja a la cola asyncio del SSE"""
    while True:
        try:
            msg = mp_queue.get()
            asyncio.run_coroutine_threadsafe(async_queue.put(msg), loop)
            if msg.get("type") in ("complete", "error"):
                break
        except Exception:
            break

@router.post("/start", response_model=StartAnalysisResponse)
async def start_analysis(
    file: UploadFile = File(...),
    payload: str = Form(...)
):
    try:
        config_data = json.loads(payload)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="El payload no es un JSON válido")
        
    import re
    analysis_config = config_data.get('analysisConfig', {})
    raw_name = analysis_config.get('name', '').strip()
    if not raw_name:
        raw_name = f"Auditoria_{str(uuid.uuid4())[:6]}"
    
    # Limpiar caracteres inválidos para carpetas y URLs
    job_id = re.sub(r'[\\/*?:"<>|]', '_', raw_name).replace(' ', '_')
    
    active_queues[job_id] = asyncio.Queue()
    mp_queue = mp.Queue()
    
    file_bytes = await file.read()
    
    # Despachar la tarea a un nuevo Proceso del SO (PID Aislado)
    process = mp.Process(target=worker_process_entrypoint, args=(job_id, config_data, file_bytes, mp_queue))
    process.start()
    
    active_processes[job_id] = process
    
    # Iniciar el puente Thread -> Asyncio
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
                # Esperar hasta que el worker ponga un mensaje en la cola
                message = await queue.get()
                
                if message.get("type") == "complete":
                    yield f"data: {json.dumps(message)}\n\n"
                    break
                    
                if message.get("type") == "error":
                    yield f"data: {json.dumps(message)}\n\n"
                    break
                    
                yield f"data: {json.dumps(message)}\n\n"
        finally:
            # Garbage collection: Limpiar la memoria si el cliente se desconecta o termina
            if job_id in active_queues:
                del active_queues[job_id]

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/contratos")
def get_contratos(job_id: str = None, db: Session = Depends(get_db)):
    query = db.query(Contrato)
    if job_id:
        query = query.filter(Contrato.id_analisis == job_id)
    
    contratos = query.order_by(Contrato.id.desc()).limit(100).all()
    return contratos
