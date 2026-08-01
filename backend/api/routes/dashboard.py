import os
from fastapi import APIRouter, Depends, Query, HTTPException, Body
from sqlalchemy.orm import Session
from database.database import get_db
from database.models import ContratoAnalisis, CacheSecop, ResultadoOCR
import pandas as pd
import json
import asyncio
import pathlib

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
        
    data_list = []
    for vinculo, cache in resultados:
        row = cache.datos_completos.copy() if cache.datos_completos else {}
        row['internal_id'] = vinculo.id
        row['llave_busqueda'] = vinculo.llave_busqueda
        
        # Mezclar también hallazgos locales del análisis (ej. OCR previo)
        if vinculo.hallazgos_ocr:
            row.update(vinculo.hallazgos_ocr)
            
        # Traer los Resultados OCR relacionales más recientes
        ocr_results = db.query(ResultadoOCR).filter(ResultadoOCR.llave_busqueda == vinculo.llave_busqueda).all()
        if ocr_results:
            for ocr in ocr_results:
                col_name = f"Resultado OCR {ocr.palabra_clave}"
                texto = f"Contexto Previo: {ocr.contexto_previo}\n\nCoincidencia: {ocr.bloque_coincidencia}\n\nContexto Posterior: {ocr.contexto_posterior}"
                # Si hay múltiples matches para la misma palabra, los unimos
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
