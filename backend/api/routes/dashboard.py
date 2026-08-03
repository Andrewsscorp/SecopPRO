import os
from fastapi import APIRouter, Depends, Query, HTTPException, Body
from sqlalchemy.orm import Session
from database.database import get_db
from database.models import ContratoAnalisis, CacheSecop, ResultadoOCR, PDFsConsulta, ContratacionTerceros, AnalisisRealizado
import pandas as pd
import json
import asyncio
import pathlib
import uuid
from datetime import datetime
import shutil

from utils.rule_engine import apply_comparisons
from services.ocr_engine import analyze_zip_with_ocr

router = APIRouter()

def get_contratos_df(db: Session, job_id: str) -> pd.DataFrame:
    # Hacemos JOIN entre el análisis y la caché
    resultados = db.query(ContratoAnalisis, CacheSecop).join(
        CacheSecop, ContratoAnalisis.llave_busqueda == CacheSecop.llave_busqueda
    ).filter(ContratoAnalisis.id_analisis == job_id).all()
    
    if not resultados:
        return pd.DataFrame()
        
    llaves = [vinculo.llave_busqueda for vinculo, cache in resultados]
    documentos = list({cache.documento_proveedor for vinculo, cache in resultados if cache.documento_proveedor})
    
    # Batch queries (Fix N+1 performance issue)
    pdfs = db.query(PDFsConsulta).filter(PDFsConsulta.llave_busqueda.in_(llaves)).all()
    pdf_dict = {pdf.llave_busqueda: pdf for pdf in pdfs}
    
    terceros = db.query(ContratacionTerceros).filter(ContratacionTerceros.documento.in_(documentos)).all()
    tercero_dict = {t.documento: t for t in terceros}
    
    ocrs = db.query(ResultadoOCR).filter(ResultadoOCR.llave_busqueda.in_(llaves)).all()
    ocr_dict = {}
    for ocr in ocrs:
        if ocr.llave_busqueda not in ocr_dict:
            ocr_dict[ocr.llave_busqueda] = []
        ocr_dict[ocr.llave_busqueda].append(ocr)
        
    data_list = []
    for vinculo, cache in resultados:
        row = {c.name: getattr(cache, c.name) for c in cache.__table__.columns if c.name != 'datos_adicionales'}
        if getattr(cache, 'datos_adicionales', None):
            row.update(cache.datos_adicionales)
        row['internal_id'] = vinculo.id
        row['llave_busqueda'] = vinculo.llave_busqueda
        
        # --- Adjuntar Info de PDFsConsulta ---
        pdf_info = pdf_dict.get(vinculo.llave_busqueda)
        if pdf_info:
            row['cantidad_documentos_pdf'] = pdf_info.cantidad_pdfs
            row['nombre_pdf'] = ", ".join(pdf_info.lista_pdfs) if pdf_info.lista_pdfs else "No encontrado"
            row['sha_pdf'] = ", ".join([f"{k}: {v}" for k, v in pdf_info.sha256_pdfs.items()]) if pdf_info.sha256_pdfs else "No encontrado"
        else:
            row['cantidad_documentos_pdf'] = 0
            row['nombre_pdf'] = "No encontrado"
            row['sha_pdf'] = "No encontrado"
            
        # --- Adjuntar Info de Terceros ---
        tercero_info = tercero_dict.get(cache.documento_proveedor)
        if tercero_info and tercero_info.resumen_calculado:
            row['total_contratos'] = tercero_info.resumen_calculado.get("total_contratos", "No calculado")
            row['valor_total_contratos'] = tercero_info.resumen_calculado.get("valor_total_contratos", "No calculado")
            row['fecha_primer_contrato'] = tercero_info.resumen_calculado.get("fecha_primer_contrato", "No calculado")
            entidades = tercero_info.resumen_calculado.get("lista_entidades", [])
            row['lista_entidades_contrato'] = ", ".join(entidades) if entidades else "No calculado"
        else:
            row['total_contratos'] = "No calculado"
            row['valor_total_contratos'] = "No calculado"
            row['fecha_primer_contrato'] = "No calculado"
            row['lista_entidades_contrato'] = "No calculado"

        # Mezclar también hallazgos locales del análisis (ej. OCR previo)
        if vinculo.hallazgos_ocr:
            row.update(vinculo.hallazgos_ocr)
            
        # Traer los Resultados OCR relacionales más recientes
        ocr_results = ocr_dict.get(vinculo.llave_busqueda, [])
        for ocr in ocr_results:
            col_name = f"Resultado OCR {ocr.palabra_clave}"
            texto = f"Contexto Previo: {ocr.contexto_previo}\n\nCoincidencia: {ocr.bloque_coincidencia}\n\nContexto Posterior: {ocr.contexto_posterior}"
            if col_name in row and row[col_name]:
                row[col_name] += f"\n\n--- OTRO HALLAZGO ---\n\n{texto}"
            else:
                row[col_name] = texto
            
        data_list.append(row)
        
    df = pd.DataFrame(data_list)
    return apply_comparisons(df)

@router.get("/stats")
def get_dashboard_stats(jobId: str, db: Session = Depends(get_db)):
    df = get_contratos_df(db, jobId)
    if df.empty:
        return {
            "procesosAnalizados": 0,
            "alertasEncontradas": 0,
            "tasaCumplimiento": 0.0
        }
        
    total_procesos = len(df)
    alertas = 0
    alert_cols = [c for c in df.columns if c.endswith('_cumple')]
    
    if alert_cols:
        has_alert = (df[alert_cols] == False).any(axis=1)
        alertas = int(has_alert.sum())
        
    tasa = ((total_procesos - alertas) / total_procesos) * 100 if total_procesos > 0 else 0
    
    return {
        "procesosAnalizados": total_procesos,
        "alertasEncontradas": alertas,
        "tasaCumplimiento": round(tasa, 1)
    }

@router.get("/search")
def search_dashboard(
    jobId: str, 
    q: str = Query("", min_length=0),
    db: Session = Depends(get_db)
):
    user_docs = os.path.join(os.path.expanduser('~'), 'Documents', 'SecopPRO_Consul', jobId)
    for folder in ['Doc_Origen', 'DocumentosDescargados', 'Resultados_PDF', 'Resultados_Excel', 'Log']:
        os.makedirs(os.path.join(user_docs, folder), exist_ok=True)
        
    df = get_contratos_df(db, jobId)
    if df.empty:
        return []
        
    if q:
        mask = df.astype(str).apply(lambda x: x.str.contains(q, case=False, na=False)).any(axis=1)
        df = df[mask]
        
    df = df.replace({pd.NA: None, pd.NaT: None})
    import numpy as np
    df = df.replace([np.nan], [None])
    
    return df.to_dict(orient="records")

@router.post("/ocr")
async def run_dashboard_ocr(
    jobId: str = Body(...),
    searchTerm: str = Body(...),
    db: Session = Depends(get_db)
):
    """
    Ejecuta el OCR en background sobre los PDFs descargados, extrae contexto y guarda en DB.
    """
    import re
    loop = asyncio.get_running_loop()
    
    contratos = db.query(ContratoAnalisis).filter(ContratoAnalisis.id_analisis == jobId).all()
    if not contratos:
        raise HTTPException(status_code=404, detail="No se encontraron contratos para este análisis.")
        
    resultados_totales = []
    
    for c in contratos:
        llave_safe = re.sub(r'[\\/*?:"<>|]', '_', c.llave_busqueda)
        user_docs = pathlib.Path(os.path.expanduser('~')) / 'Documents' / 'SecopPRO_Consul' / jobId
        zip_path = str(user_docs / 'DocumentosDescargados' / f"{llave_safe}.zip")
        
        if os.path.exists(zip_path):
            # Analiza y devuelve contexto estructurado
            ocr_result = await loop.run_in_executor(None, analyze_zip_with_ocr, zip_path, searchTerm)
            
            if ocr_result and "matches" in ocr_result and len(ocr_result["matches"]) > 0:
                for match in ocr_result["matches"]:
                    # Guardar en base de datos
                    nuevo_resultado = ResultadoOCR(
                        llave_busqueda=c.llave_busqueda,
                        palabra_clave=searchTerm,
                        sha256_archivo=match.get("sha256", "NO_HASH"),
                        archivo_origen=match.get("file", "Desconocido.pdf"),
                        contexto_previo=match.get("contexto_previo", ""),
                        bloque_coincidencia=match.get("bloque_coincidencia", ""),
                        contexto_posterior=match.get("contexto_posterior", "")
                    )
                    db.add(nuevo_resultado)
                    
                    resultados_totales.append({
                        "llave": c.llave_busqueda,
                        "archivo": match.get("file"),
                        "match": match.get("bloque_coincidencia")
                    })
                    
                db.commit()
                
    return {"message": "OCR finalizado", "matches_found": len(resultados_totales), "details": resultados_totales}

@router.get("/history")
def get_dashboard_history(limit: int = 10, offset: int = 0, db: Session = Depends(get_db)):
    """
    Retorna el historial de todos los análisis realizados (Auditorías masivas) con paginación.
    """
    total = db.query(AnalisisRealizado).count()
    historial = db.query(AnalisisRealizado).order_by(AnalisisRealizado.hora_inicio.desc()).offset(offset).limit(limit).all()
    
    resultados = []
    for h in historial:
        # Calcular llaves reales procesadas
        llaves_count = db.query(ContratoAnalisis).filter(ContratoAnalisis.id_analisis == h.id).count()
        
        resultados.append({
            "id": h.id,
            "nombre_analisis": h.nombre_analisis or h.nombre_documento,
            "archivo_origen": h.nombre_documento,
            "hora_inicio": h.hora_inicio.isoformat() if h.hora_inicio else None,
            "tiempo_respuesta": h.tiempo_respuesta,
            "estado": h.estado.value if hasattr(h.estado, 'value') else h.estado,
            "cantidad_llaves": llaves_count
        })
        
    return {"data": resultados, "total": total}

@router.post("/open-folder")
def open_job_folder(payload: dict = Body(...)):
    import os
    import sys
    import subprocess
    job_id = payload.get("jobId")
    if not job_id:
        raise HTTPException(status_code=400, detail="Falta jobId")
        
    user_docs = os.path.join(os.path.expanduser('~'), 'Documents', 'SecopPRO_Consul', job_id)
    if not os.path.exists(user_docs):
        raise HTTPException(status_code=404, detail="La carpeta no existe.")
        
    if sys.platform == 'win32':
        os.startfile(user_docs)
    elif sys.platform == 'darwin':
        subprocess.Popen(['open', user_docs])
    else:
        subprocess.Popen(['xdg-open', user_docs])
        
    return {"message": "Carpeta abierta exitosamente."}

@router.post("/duplicate")
def duplicate_job(payload: dict = Body(...), db: Session = Depends(get_db)):
    job_id = payload.get("jobId")
    new_name = payload.get("newName")
    
    if not job_id or not new_name:
        raise HTTPException(status_code=400, detail="Se requiere jobId y newName")
        
    # Validar nombre único
    existente = db.query(AnalisisRealizado).filter(AnalisisRealizado.nombre_analisis == new_name).first()
    if existente:
        raise HTTPException(status_code=400, detail="Ya existe un análisis con este nombre.")
        
    original = db.query(AnalisisRealizado).filter(AnalisisRealizado.id == job_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Análisis original no encontrado.")
        
    import re
    new_id = re.sub(r'[\\/*?:"<>|]', '_', new_name).replace(' ', '_') + "_" + str(uuid.uuid4())[:6]
    
    # 1. Duplicar AnalisisRealizado
    nuevo_analisis = AnalisisRealizado(
        id=new_id,
        nombre_analisis=new_name,
        sha256_archivo=original.sha256_archivo,
        nombre_documento=original.nombre_documento,
        total_columnas=original.total_columnas,
        columna_escogida=original.columna_escogida,
        estado=original.estado,
        hora_inicio=datetime.utcnow(),
        tiempo_respuesta=original.tiempo_respuesta
    )
    db.add(nuevo_analisis)
    
    # 2. Duplicar Contratos
    contratos = db.query(ContratoAnalisis).filter(ContratoAnalisis.id_analisis == job_id).all()
    for c in contratos:
        nuevo_contrato = ContratoAnalisis(
            id=str(uuid.uuid4()),
            id_analisis=new_id,
            llave_busqueda=c.llave_busqueda,
            hallazgos_ocr=c.hallazgos_ocr,
            rag_resolutions=c.rag_resolutions
        )
        db.add(nuevo_contrato)
        
    # 3. Duplicar PdfAiCache si existe
    from database.models import PdfAiCache
    pdf_cache = db.query(PdfAiCache).filter(PdfAiCache.job_id == job_id).first()
    if pdf_cache:
        nuevo_pdf_cache = PdfAiCache(
            job_id=new_id,
            portada=pdf_cache.portada,
            resumen=pdf_cache.resumen,
            resultados=pdf_cache.resultados,
            comparaciones=pdf_cache.comparaciones,
            graficos=pdf_cache.graficos,
            adjudicatarios=pdf_cache.adjudicatarios,
            conclusiones=pdf_cache.conclusiones,
            anexos=pdf_cache.anexos,
            tokens_estimados=pdf_cache.tokens_estimados,
            tokens_usados=pdf_cache.tokens_usados
        )
        db.add(nuevo_pdf_cache)
        
    # 4. Copiar carpeta de archivos físicos
    user_docs = os.path.join(os.path.expanduser('~'), 'Documents', 'SecopPRO_Consul')
    old_folder = os.path.join(user_docs, job_id)
    new_folder = os.path.join(user_docs, new_id)
    
    if os.path.exists(old_folder):
        try:
            shutil.copytree(old_folder, new_folder)
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Error al copiar archivos físicos: {str(e)}")
            
    db.commit()
    
    return {"message": "Análisis duplicado exitosamente.", "newJobId": new_id}

