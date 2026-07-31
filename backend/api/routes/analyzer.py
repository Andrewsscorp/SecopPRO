from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
import asyncio
import uuid
import json
from api.schemas import StartAnalysisResponse
from workers.secop_worker import run_secop_extraction
from fastapi import Depends
from sqlalchemy.orm import Session
from database.database import get_db
from database.models import Contrato

router = APIRouter()

# Diccionario global en memoria para guardar las colas de cada job_id
active_queues = {}
# Set global para registrar trabajos cancelados por el usuario
active_cancellations = set()

@router.post("/cancel/{job_id}")
def cancel_analysis(job_id: str):
    active_cancellations.add(job_id)
    return {"message": "Señal de cancelación enviada al motor."}

@router.post("/start", response_model=StartAnalysisResponse)
async def start_analysis(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    payload: str = Form(...)
):
    try:
        # Parsear el JSON que viene como string en el FormData
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
    
    # Asegurar que el job_id no esté en cancelaciones previas
    if job_id in active_cancellations:
        active_cancellations.remove(job_id)
    
    # Crear una cola única para este trabajo
    active_queues[job_id] = asyncio.Queue()
    
    file_bytes = await file.read()
    
    # Despachar la tarea al Event Loop de FastAPI, pasando active_cancellations
    background_tasks.add_task(run_secop_extraction, job_id, config_data, active_queues[job_id], file_bytes, active_cancellations)
    
    return {"job_id": job_id, "message": "Análisis iniciado en segundo plano"}


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
