import os
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from database.database import get_db
from database.models import Contrato
import pandas as pd
import json

from utils.rule_engine import apply_comparisons

router = APIRouter()

def get_contratos_df(db: Session, job_id: str) -> pd.DataFrame:
    contratos = db.query(Contrato).filter(Contrato.id_analisis == job_id).all()
    if not contratos:
        return pd.DataFrame()
        
    data_list = []
    for c in contratos:
        row = c.datos_secop.copy() if c.datos_secop else {}
        row['internal_id'] = c.id
        row['llave_busqueda'] = c.llave_busqueda
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
    
    # Contar alertas (si alguna regla evaluó a False)
    alertas = 0
    alert_cols = [c for c in df.columns if c.endswith('_cumple')]
    
    if alert_cols:
        # Una fila tiene alerta si al menos una de sus reglas es == False (ojo, puede ser None)
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
    # --- CREACIÓN AUTOMÁTICA DEL WORKSPACE DEL USUARIO ---
    # Simula la fase donde el motor descarga y almacena los documentos.
    user_docs = os.path.join(os.path.expanduser('~'), 'Documents', 'SecopPRO_Consul', jobId)
    for folder in ['Doc_Origen', 'DocumentosDescargados', 'Resultados_PDF', 'Resultados_Excel', 'Log']:
        os.makedirs(os.path.join(user_docs, folder), exist_ok=True)
        
    df = get_contratos_df(db, jobId)
    if df.empty:
        return []
        
    if q:
        # Búsqueda global en todas las columnas (case insensitive)
        mask = df.astype(str).apply(lambda x: x.str.contains(q, case=False, na=False)).any(axis=1)
        df = df[mask]
        
    # Convertir NaN/NaT a None para JSON
    df = df.replace({pd.NA: None, pd.NaT: None})
    import numpy as np
    df = df.replace([np.nan], [None])
    
    return df.to_dict(orient="records")
