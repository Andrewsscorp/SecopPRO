import json
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from services.pdf_ai_service import (
    PdfAiService, 
    get_cover_instruction, 
    get_executive_summary_instruction, 
    get_results_instruction, 
    get_comparisons_instruction, 
    get_graphics_instruction,
    get_contractors_instruction,
    get_conclusions_instruction
)
from database.database import SessionLocal
from database.models import PdfAiCache, AuditoriaSistema, CacheSecop, ContratoAnalisis
from datetime import datetime

router = APIRouter()
pdf_ai_service = PdfAiService()

class GenerateAiRequest(BaseModel):
    job_id: str
    profundidad: str = "medio" # basico, medio, profundo
    force_regenerate: bool = False
    selected_nits: Optional[List[str]] = None

@router.get("/check-cache/{job_id}")
def check_cache(job_id: str):
    db = SessionLocal()
    try:
        cache = db.query(PdfAiCache).filter(PdfAiCache.job_id == job_id).first()
        if not cache:
            return {"exists": False}
        return {
            "exists": True,
            "portada": cache.portada,
            "resumen": cache.resumen,
            "resultados": cache.resultados,
            "comparaciones": cache.comparaciones,
            "graficos": cache.graficos,
            "adjudicatarios": cache.adjudicatarios,
            "conclusiones": cache.conclusiones,
            "tokens_usados": cache.tokens_usados
        }
    finally:
        db.close()

@router.get("/contractors/{job_id}")
def get_job_contractors(job_id: str):
    db = SessionLocal()
    try:
        contratos = db.query(CacheSecop).join(
            ContratoAnalisis, ContratoAnalisis.llave_busqueda == CacheSecop.llave_busqueda
        ).filter(ContratoAnalisis.id_analisis == job_id).all()
        
        nits_vistos = set()
        result = []
        for c in contratos:
            if c.documento_proveedor and c.documento_proveedor not in nits_vistos:
                nits_vistos.add(c.documento_proveedor)
                result.append({
                    "nit": c.documento_proveedor,
                    "nombre": c.proveedor_adjudicado or "Desconocido",
                    "valor": c.valor_del_contrato
                })
        # Ordenar de mayor a menor valor (opcional, ayuda visualmente)
        def parse_val(val_str):
            try:
                return float(str(val_str).replace(",", "").replace(".", "").strip())
            except:
                return 0.0
        result.sort(key=lambda x: parse_val(x["valor"]), reverse=True)
        return {"contractors": result}
    finally:
        db.close()

def stream_and_cache(job_id: str, field: str, instruction: str, profundidad: str = "medio", payload_getter=None, force_regenerate: bool = False):
    db = SessionLocal()
    
    # 1. Check Cache
    try:
        cache = db.query(PdfAiCache).filter(PdfAiCache.job_id == job_id).first()
        if cache and not force_regenerate:
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
        elif cache and force_regenerate:
            # Auditar sobreescritura
            auditoria = AuditoriaSistema(
                accion="Sobreescritura de PDF AI",
                detalles={"campo_sobreescrito": field, "nivel_profundidad": profundidad, "job_id": job_id}
            )
            db.add(auditoria)
            db.commit()
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
        stream_and_cache(req.job_id, "portada", instruction, req.profundidad, pdf_ai_service.get_cover_payload, req.force_regenerate),
        media_type="text/event-stream"
    )

@router.post("/generate-executive-summary")
def generate_executive_summary(req: GenerateAiRequest):
    instruction = get_executive_summary_instruction(req.profundidad)
    return StreamingResponse(
        stream_and_cache(req.job_id, "resumen", instruction, req.profundidad, None, req.force_regenerate),
        media_type="text/event-stream"
    )

@router.post("/generate-results")
def generate_results(req: GenerateAiRequest):
    instruction = get_results_instruction(req.profundidad)
    return StreamingResponse(
        stream_and_cache(req.job_id, "resultados", instruction, req.profundidad, None, req.force_regenerate),
        media_type="text/event-stream"
    )

@router.post("/generate-comparisons")
def generate_comparisons(req: GenerateAiRequest):
    # Comparaciones requiere leer las reglas normativas basadas en el JSON
    payload = pdf_ai_service.get_contracts_payload(req.job_id, req.profundidad)
    final_instruction = get_comparisons_instruction(payload, req.profundidad)
    return StreamingResponse(
        stream_and_cache(req.job_id, "comparaciones", final_instruction, req.profundidad, None, req.force_regenerate),
        media_type="text/event-stream"
    )

@router.post("/generate-graphics")
def generate_graphics(req: GenerateAiRequest):
    instruction = get_graphics_instruction(req.profundidad)
    return StreamingResponse(
        stream_and_cache(req.job_id, "graficos", instruction, req.profundidad, None, req.force_regenerate),
        media_type="text/event-stream"
    )

@router.post("/generate-contractors")
def generate_contractors(req: GenerateAiRequest):
    instruction = get_contractors_instruction(req.profundidad)
    payload_getter = lambda jid: pdf_ai_service.get_contractors_payload(jid, selected_nits=req.selected_nits)
    return StreamingResponse(
        stream_and_cache(req.job_id, "adjudicatarios", instruction, req.profundidad, payload_getter, req.force_regenerate),
        media_type="text/event-stream"
    )

@router.post("/generate-conclusions")
def generate_conclusions(req: GenerateAiRequest):
    instruction = get_conclusions_instruction(req.profundidad)
    return StreamingResponse(
        stream_and_cache(req.job_id, "conclusiones", instruction, req.profundidad, pdf_ai_service.get_conclusions_payload, req.force_regenerate),
        media_type="text/event-stream"
    )

@router.post("/generate-anexos")
def generate_anexos(req: GenerateAiRequest):
    from services.pdf_ai_service import get_anexos_instruction, get_anexos_payload
    instruction = get_anexos_instruction(req.profundidad)
    return StreamingResponse(
        stream_and_cache(req.job_id, "anexos", instruction, req.profundidad, get_anexos_payload, req.force_regenerate),
        media_type="text/event-stream"
    )

class ResolveRuleRequest(BaseModel):
    job_id: str
    llave_busqueda: str
    regla: str

@router.post("/resolve-rule")
def resolve_rule(req: ResolveRuleRequest):
    from services.rule_resolver import SmartRuleResolver
    resolver = SmartRuleResolver()
    result = resolver.resolve_rule(req.job_id, req.llave_busqueda, req.regla)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result

class RunScraperRequest(BaseModel):
    job_id: str
    llave_busqueda: str
    urlproceso: str
    descargar_archivos: bool = True

@router.post("/run-scraper")
async def run_scraper(req: RunScraperRequest):
    import asyncio
    from services.pdf_scraper_v2 import download_pdfs_for_contract_v2
    
    log_queue = asyncio.Queue()
    
    try:
        # Run the scraper asynchronously
        result = await download_pdfs_for_contract_v2(
            job_id=req.job_id,
            llave=req.llave_busqueda,
            urlproceso=req.urlproceso,
            log_queue=log_queue,
            descargar_archivos=req.descargar_archivos
        )
        
        # Guardar en PDFsConsulta para que el motor de IA pueda leerlo
        if result and "lista_pdfs" in result:
            from database.database import SessionLocal
            from database.models import PDFsConsulta
            import datetime
            
            db = SessionLocal()
            try:
                pdf_entry = db.query(PDFsConsulta).filter(PDFsConsulta.llave_busqueda == req.llave_busqueda).first()
                if not pdf_entry:
                    pdf_entry = PDFsConsulta(llave_busqueda=req.llave_busqueda)
                    db.add(pdf_entry)
                
                pdf_entry.cantidad_pdfs = result.get("cantidad_pdfs", 0)
                pdf_entry.lista_pdfs = result.get("lista_pdfs", [])
                pdf_entry.sha256_pdfs = result.get("sha256_pdfs", {})
                pdf_entry.nombre_zip = result.get("nombre_zip", "")
                pdf_entry.ruta_global_zip = result.get("ruta_global_zip", "")
                pdf_entry.fecha_guardado = datetime.datetime.utcnow()
                
                db.commit()
            except Exception as dbe:
                print(f"Error al guardar PDFsConsulta: {dbe}")
                db.rollback()
            finally:
                db.close()
                
        return {"status": "success", "message": "Scraper ejecutado correctamente.", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en scraper: {str(e)}")
