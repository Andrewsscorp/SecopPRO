from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
import uuid
import asyncio
import aiohttp
import ssl
from datetime import datetime

from database.database import get_db
from database.models import AnalisisRealizado, EstadoAnalisis, CacheSecop, ContratoAnalisis

router = APIRouter()

SOCRATA_SECOP_URL = "https://www.datos.gov.co/resource/jbjy-vk9h.json"

@router.get("/direct")
async def direct_search(
    nombre: str = None,
    documento: str = None,
    ciudad: str = None,
    fecha_inicio: str = None,
    fecha_fin: str = None,
    db: Session = Depends(get_db)
):
    # Construir query SoQL
    where_clauses = []
    
    if nombre:
        where_clauses.append(f"(upper(nombre_entidad) like upper('%{nombre}%') OR upper(proveedor_adjudicado) like upper('%{nombre}%'))")
    if documento:
        where_clauses.append(f"documento_proveedor = '{documento}'")
    if ciudad:
        where_clauses.append(f"upper(ciudad) like upper('%{ciudad}%')")
    if fecha_inicio and fecha_fin:
        where_clauses.append(f"fecha_de_firma between '{fecha_inicio}T00:00:00.000' and '{fecha_fin}T23:59:59.000'")
        
    if not where_clauses:
        raise HTTPException(status_code=400, detail="Debe proveer al menos un criterio de búsqueda.")
        
    where_query = " AND ".join(where_clauses)
    
    params = {
        "$where": where_query,
        "$limit": 500,  # Limitar a 500 para evitar tiempos de respuesta excesivos
        "$order": "fecha_de_firma DESC"
    }
    
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=ctx)) as session:
        try:
            async with session.get(SOCRATA_SECOP_URL, params=params) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    raise HTTPException(status_code=500, detail=f"Error consultando SECOP API: {text}")
                data = await resp.json()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error de conexión con SECOP: {str(e)}")

    if not data:
        return {
            "job_id": None,
            "count": 0,
            "message": "No se encontraron contratos con los criterios especificados."
        }

    # 1. Crear AnalisisRealizado
    job_id = f"Busqueda_Directa_{uuid.uuid4().hex[:6]}"
    nuevo_analisis = AnalisisRealizado(
        id=job_id,
        nombre_analisis=job_id,
        sha256_archivo="API_DIRECT",
        nombre_documento="Búsqueda Nativa API",
        total_columnas=0,
        columna_escogida="proceso_de_compra",
        estado=EstadoAnalisis.COMPLETADO
    )
    db.add(nuevo_analisis)

    # 2. Insertar en CacheSecop y ContratosAnalisis
    seen_keys = set()
    for item in data:
        llave = item.get("proceso_de_compra")
        if not llave or llave in seen_keys:
            continue
            
        seen_keys.add(llave)
            
        # Extraer urlproceso de forma segura, Socrata a veces lo manda como objeto {"url": "..."}
        raw_url = item.get("urlproceso")
        url_proceso_str = raw_url.get("url") if isinstance(raw_url, dict) else raw_url
        
        # Verificar si ya existe en CacheSecop
        cache_entry = db.query(CacheSecop).filter(CacheSecop.llave_busqueda == llave).first()
        if not cache_entry:
            cache_entry = CacheSecop(
                llave_busqueda=llave,
                nombre_entidad=item.get("nombre_entidad"),
                nit_entidad=item.get("nit_entidad"),
                ciudad=item.get("ciudad"),
                fecha_de_firma=item.get("fecha_de_firma"),
                proveedor_adjudicado=item.get("proveedor_adjudicado"),
                documento_proveedor=item.get("documento_proveedor"),
                valor_del_contrato=item.get("valor_del_contrato", item.get("valor_contrato")),
                descripcion_del_proceso=item.get("descripcion_del_proceso"),
                estado_contrato=item.get("estado_contrato"),
                urlproceso=url_proceso_str,
                fecha_de_inicio_del_contrato=item.get("fecha_de_inicio_del_contrato"),
                fecha_de_fin_del_contrato=item.get("fecha_de_fin_del_contrato"),
                # Resto guardarlo en adicionales para no perder nada
                datos_adicionales=item
            )
            db.add(cache_entry)
            
        # Asociar al análisis actual
        contrato_analisis = ContratoAnalisis(
            id_analisis=job_id,
            llave_busqueda=llave
        )
        db.add(contrato_analisis)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error guardando resultados en BD: {str(e)}")

    return {
        "job_id": job_id,
        "count": len(data),
        "message": "Búsqueda completada exitosamente."
    }
