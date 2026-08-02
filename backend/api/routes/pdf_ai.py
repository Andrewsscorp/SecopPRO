import json
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from services.pdf_ai_service import (
    PdfAiService, 
    get_cover_instruction, 
    get_executive_summary_instruction, 
    get_results_instruction, 
    get_comparisons_instruction, 
    get_graphics_instruction
)
from database.database import SessionLocal
from database.models import PdfAiCache
from datetime import datetime

router = APIRouter()
pdf_ai_service = PdfAiService()

class GenerateAiRequest(BaseModel):
    job_id: str
    profundidad: str = "medio" # basico, medio, profundo

def stream_and_cache(job_id: str, field: str, instruction: str, profundidad: str = "medio", payload_getter=None):
    db = SessionLocal()
    
    # 1. Check Cache
    try:
        cache = db.query(PdfAiCache).filter(PdfAiCache.job_id == job_id).first()
        if cache:
            cached_content = getattr(cache, field)
            if cached_content:
                # Retornar con un efecto de máquina de escribir artificial para simular a la IA
                import time
                chunk_size = 5 # Enviar de a 5 caracteres
                yield "data: " + json.dumps({"estimated_tokens": cache.tokens_estimados}) + "\n\n"
                
                for i in range(0, len(cached_content), chunk_size):
                    chunk = cached_content[i:i+chunk_size]
                    yield "data: " + json.dumps({"chunk": chunk}) + "\n\n"
                    time.sleep(0.01) # 10ms de espera por bloque para el efecto visual
                
                yield "data: " + json.dumps({"usage": {"totalTokenCount": cache.tokens_usados, "cached": True}}) + "\n\n"
                return
    except Exception as e:
        print("Error checking cache:", e)

    # 2. Not in Cache, Generate
    try:
        pdf_ai_service._load_config()
        if payload_getter:
            payload = payload_getter(job_id)
        else:
            payload = pdf_ai_service.get_contracts_payload(job_id, profundidad=profundidad)
        
        if payload == "[]":
            yield "data: " + json.dumps({"error": "No se encontraron contratos para el análisis especificado."}) + "\n\n"
            return
            
        # Determinar la instrucción final (por si es una función que filtra dinámicamente)
        if callable(instruction):
            final_instruction = instruction(payload)
        else:
            final_instruction = instruction

        # Generador de streaming (pasamos profundidad para override de modelo si aplica)
        full_content = ""
        total_tokens = 0
        
        for sse_chunk in pdf_ai_service.stream_generate_content(final_instruction, payload, profundidad=profundidad):
            yield sse_chunk
            
            # Acumular el texto para guardar en cache
            if sse_chunk.startswith("data: "):
                try:
                    data_obj = json.loads(sse_chunk[6:])
                    if "chunk" in data_obj:
                        full_content += data_obj["chunk"]
                    if "usage" in data_obj:
                        total_tokens = data_obj["usage"].get("totalTokenCount", 0)
                except:
                    pass

        # 3. Save to Cache
        if full_content:
            try:
                cache = db.query(PdfAiCache).filter(PdfAiCache.job_id == job_id).first()
                if not cache:
                    cache = PdfAiCache(job_id=job_id, tokens_estimados=0)
                    db.add(cache)
                
                setattr(cache, field, full_content)
                cache.tokens_usados = (cache.tokens_usados or 0) + total_tokens # Acumular tokens si generó portada y luego resumen
                cache.fecha_generacion = datetime.utcnow()
                db.commit()
            except Exception as e:
                db.rollback()
                print("Error guardando en cache:", e)

    finally:
        db.close()


@router.post("/generate-cover")
def generate_cover(req: GenerateAiRequest):
    instruction = get_cover_instruction(req.profundidad)
    return StreamingResponse(
        stream_and_cache(req.job_id, "portada", instruction, req.profundidad, pdf_ai_service.get_cover_payload),
        media_type="text/event-stream"
    )

@router.post("/generate-executive-summary")
def generate_executive_summary(req: GenerateAiRequest):
    instruction = get_executive_summary_instruction(req.profundidad)
    return StreamingResponse(
        stream_and_cache(req.job_id, "resumen", instruction, req.profundidad),
        media_type="text/event-stream"
    )

@router.post("/generate-results")
def generate_results(req: GenerateAiRequest):
    instruction = get_results_instruction(req.profundidad)
    return StreamingResponse(
        stream_and_cache(req.job_id, "resultados", instruction, req.profundidad),
        media_type="text/event-stream"
    )

@router.post("/generate-comparisons")
def generate_comparisons(req: GenerateAiRequest):
    # Comparaciones requiere leer las reglas normativas basadas en el JSON
    payload = pdf_ai_service.get_contracts_payload(req.job_id, req.profundidad)
    final_instruction = get_comparisons_instruction(payload, req.profundidad)
    return StreamingResponse(
        stream_and_cache(req.job_id, "comparaciones", final_instruction, req.profundidad),
        media_type="text/event-stream"
    )

@router.post("/generate-graphics")
def generate_graphics(req: GenerateAiRequest):
    instruction = get_graphics_instruction(req.profundidad)
    return StreamingResponse(
        stream_and_cache(req.job_id, "graficos", instruction, req.profundidad),
        media_type="text/event-stream"
    )

