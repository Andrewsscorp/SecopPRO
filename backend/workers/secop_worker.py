"""
secop_extraction_worker.py
---------------------------
Worker asíncrono de extracción masiva SECOP (metadatos + scraper).

Cambios arquitectónicos v3.0:
1. Caché Global SECOP: Si el contrato ya existe en CacheSecop y no se fuerza
   actualización, se carga en milisegundos.
2. Descarga Total: Se ignoran los toggles del UI, el backend descarga *toda*
   la info de SECOP para enriquecer el Caché.
3. Merge de Datos: Si se fuerza actualización, se mezclan los JSONs para
   preservar campos históricos.
4. Trazabilidad: Se registra AnalisisRealizado y LogsServidor inmutables.
5. OCR Desacoplado: Ya no se corre OCR aquí; el worker solo baja PDFs.
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
import pathlib
import re
import ssl
import time

import aiohttp
import pandas as pd
from datetime import datetime

from database.database import SessionLocal, engine, Base
from database.models import AnalisisRealizado, CacheSecop, ContratoAnalisis, EstadoAnalisis, LogsServidor, NivelLog

logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

URL_CONTRATOS = "https://www.datos.gov.co/resource/jbjy-vk9h.json"
URL_PROCESOS = "https://www.datos.gov.co/resource/p6dx-8zbt.json"

HTTP_TIMEOUT_SECONDS = float(os.environ.get("SECOP_HTTP_TIMEOUT_SECONDS", "30"))
MAX_CONCURRENT_REQUESTS = int(os.environ.get("SECOP_MAX_CONCURRENCY", "10"))
MAX_RETRIES = int(os.environ.get("SECOP_HTTP_MAX_RETRIES", "3"))
RETRY_BASE_DELAY = float(os.environ.get("SECOP_HTTP_RETRY_BASE_DELAY", "1.0"))
SOCRATA_APP_TOKEN = os.environ.get("SOCRATA_APP_TOKEN")

_INSECURE_SSL = os.environ.get("SECOP_INSECURE_SSL", "false").lower() == "true"

FIELD_ALIASES: dict[str, str] = {
    "numero de contrato": "id_contrato",
    "numero_de_contrato": "id_contrato",
    "n de contrato": "id_contrato",
    "no de contrato": "id_contrato",
    "id contrato": "id_contrato",
    "id_contrato": "id_contrato",
    "referencia": "referencia_del_contrato",
    "referencia del contrato": "referencia_del_contrato",
    "referencia_del_contrato": "referencia_del_contrato",
    "nit": "documento_proveedor",
    "nit proveedor": "documento_proveedor",
    "documento proveedor": "documento_proveedor",
    "documento_proveedor": "documento_proveedor",
    "cedula": "documento_proveedor",
    "cédula": "documento_proveedor",
}

def _build_ssl_context() -> ssl.SSLContext:
    if _INSECURE_SSL:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx
    return ssl.create_default_context()

def _socrata_headers() -> dict:
    headers = {}
    if SOCRATA_APP_TOKEN:
        headers["X-App-Token"] = SOCRATA_APP_TOKEN
    return headers

def merge_jsons(old_data: dict, new_data: dict) -> dict:
    """Mezcla dos diccionarios recursivamente, priorizando new_data y preservando old_data"""
    if not old_data:
        return new_data or {}
    if not new_data:
        return old_data or {}
    
    merged = dict(old_data)
    for k, v in new_data.items():
        if k in merged and isinstance(merged[k], dict) and isinstance(v, dict):
            merged[k] = merge_jsons(merged[k], v)
        else:
            merged[k] = v
    return merged

def _log_db(db, job_id, mensaje, nivel=NivelLog.INFO):
    try:
        nuevo_log = LogsServidor(id_analisis=job_id, mensaje=mensaje, nivel=nivel)
        db.add(nuevo_log)
        db.commit()
    except Exception as e:
        logger.error(f"Fallo al guardar log en DB: {e}")

async def _fetch_json_with_retries(
    session: aiohttp.ClientSession, url: str, params: dict, log_queue: asyncio.Queue, context_label: str
):
    last_status = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            async with session.get(url, params=params, headers=_socrata_headers()) as response:
                last_status = response.status
                if response.status == 200:
                    data = await response.json()
                    return 200, data
                if response.status in (429, 500, 502, 503, 504) and attempt < MAX_RETRIES:
                    delay = RETRY_BASE_DELAY * (2 ** attempt)
                    await asyncio.sleep(delay)
                    continue
                return response.status, None
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            last_status = "network_error"
            if attempt < MAX_RETRIES:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                await asyncio.sleep(delay)
                continue
            return last_status, None
    return last_status, None

async def process_contract(
    session, url_contratos, url_procesos, params_contratos, params_procesos,
    valor, idx, total, log_queue, job_id, force_secop
):
    db = SessionLocal()
    try:
        progress = 30 + int(((idx + 1) / total) * 60)
        
        # 1. Chequeo de Caché
        cache_entry = db.query(CacheSecop).filter(CacheSecop.llave_busqueda == str(valor)).first()
        
        datos_finales = None
        
        if cache_entry and not force_secop:
            datos_finales = cache_entry.datos_completos
            await log_queue.put({
                "type": "log",
                "message": f"[CACHÉ LOCAL] '{valor}' cargado en milisegundos desde base de datos.",
                "progress": progress,
            })
            _log_db(db, job_id, f"Se cargó '{valor}' desde CacheSecop.")
        else:
            # 2. Descarga Total de SECOP
            status, data = await _fetch_json_with_retries(
                session, url_contratos, params_contratos, log_queue, f"Contratos:{valor}"
            )
            
            raw_data = None
            is_fallback = False
            
            if status == 200 and data:
                raw_data = data[0]
            elif status != 200:
                # Fallo API
                pass
            else:
                # Fallback a Procesos
                status2, data2 = await _fetch_json_with_retries(
                    session, url_procesos, params_procesos, log_queue, f"Procesos:{valor}"
                )
                if status2 == 200 and data2:
                    is_fallback = True
                    raw_proceso = data2[0]
                    raw_data = {
                        "id_contrato": raw_proceso.get("id_del_proceso", raw_proceso.get("referencia_del_proceso")),
                        "referencia_del_contrato": raw_proceso.get("referencia_del_proceso"),
                        "nombre_entidad": raw_proceso.get("entidad"),
                        "entidad": raw_proceso.get("entidad"),
                        "nit_entidad": raw_proceso.get("nit_entidad"),
                        "departamento": raw_proceso.get("departamento_entidad"),
                        "ciudad": raw_proceso.get("ciudad_entidad"),
                        "valor_del_contrato": raw_proceso.get("precio_base", "0"),
                        "valor_contrato": raw_proceso.get("precio_base", "0"),
                        "fecha_de_firma": "N/A",
                        "fecha_de_inicio_del_contrato": "N/A",
                        "fecha_de_fin_del_contrato": "N/A",
                        "estado_contrato": raw_proceso.get("estado_del_proceso", raw_proceso.get("fase", "Publicado")),
                        "descripcion_del_proceso": raw_proceso.get("descripcion_del_proceso"),
                        "proveedor_adjudicado": "En proceso de adjudicación",
                        "documento_proveedor": "N/A",
                        "urlproceso": raw_proceso.get("urlproceso"),
                        "modalidad_de_contratacion": raw_proceso.get("modalidad_de_contratacion"),
                        "tipo_de_contrato": raw_proceso.get("tipo_de_contrato"),
                    }
                    
            if raw_data:
                # Merge si existía en caché
                if cache_entry:
                    merged = merge_jsons(cache_entry.datos_completos, raw_data)
                    cache_entry.datos_completos = merged
                    datos_finales = merged
                    await log_queue.put({
                        "type": "log",
                        "message": f"[MERGE EXITOSO] '{valor}' actualizado desde SECOP sin perder campos históricos.",
                        "progress": progress,
                    })
                    _log_db(db, job_id, f"Merge de CacheSecop exitoso para '{valor}'.")
                else:
                    nueva_cache = CacheSecop(llave_busqueda=str(valor), datos_completos=raw_data)
                    db.add(nueva_cache)
                    datos_finales = raw_data
                    entidad = raw_data.get("nombre_entidad", raw_data.get("entidad", "Entidad desconocida"))
                    await log_queue.put({
                        "type": "log",
                        "message": f"[ÉXITO SECOP] '{valor}': {entidad[:40]} {'(Fallback)' if is_fallback else ''}",
                        "progress": progress,
                    })
                    _log_db(db, job_id, f"Descargado de SECOP e insertado en CacheSecop '{valor}'.")
                
                db.commit()
            else:
                await log_queue.put({
                    "type": "log",
                    "message": f"[AVISO] '{valor}' no encontrado en SECOP (o fallo de API)",
                    "progress": progress,
                })
                _log_db(db, job_id, f"Fallo al descargar de SECOP '{valor}'.", NivelLog.WARNING)

        # 3. Vincular Análisis
        if datos_finales:
            vinculo = ContratoAnalisis(id_analisis=job_id, llave_busqueda=str(valor))
            db.add(vinculo)
            db.commit()

    except Exception as e:
        db.rollback()
        logger.exception("Excepción procesando '%s'", valor)
        await log_queue.put({"type": "error", "message": f"[ERROR] Excepción con {valor}: {str(e)}"})
    finally:
        db.close()

def _resolve_secop_field(raw_secop_field: str) -> str:
    import unicodedata
    key = raw_secop_field.strip().lower()
    key = ''.join(c for c in unicodedata.normalize('NFD', key) if unicodedata.category(c) != 'Mn')
    return FIELD_ALIASES.get(key, raw_secop_field)

async def run_secop_extraction(
    job_id: str, config_data: dict, log_queue: asyncio.Queue, file_bytes: bytes,
    active_cancellations: set,
):
    db = SessionLocal()
    loop = asyncio.get_running_loop()
    start_time = time.time()
    try:
        await log_queue.put({"type": "log", "message": "[INFO] Iniciando extracción asíncrona hacia DB Unificada...", "progress": 5})

        mapped_columns = config_data.get('mappedColumns', [])
        key_mapping = next((col for col in mapped_columns if col.get('isKey')), None)
        
        force_secop = config_data.get('forceSecop', False)
        
        if not key_mapping:
            await log_queue.put({"type": "error", "message": "[ERROR] No se seleccionó Llave Primaria."})
            return

        excel_col = key_mapping['excelCol']
        raw_secop_field = key_mapping['secopField'] or 'id_contrato'
        secop_field = _resolve_secop_field(raw_secop_field)
        sha256 = config_data.get('fileSha256', 'NO_HASH')
        file_name = config_data.get('fileName', 'Documento.xlsx')

        await log_queue.put({"type": "log", "message": f"[OK] Llave validada: Socrata API -> '{secop_field}'", "progress": 15})

        try:
            df = await loop.run_in_executor(None, lambda: pd.read_excel(io.BytesIO(file_bytes)))
        except Exception as e:
            await log_queue.put({"type": "error", "message": f"[ERROR] No se pudo leer el Excel: {e}"})
            return

        valores_buscar = df[excel_col].dropna().astype(str).unique().tolist()
        total = len(valores_buscar)
        
        _log_db(db, job_id, f"Inicia análisis de {total} registros (Fuerza SECOP: {force_secop})")

        analisis_config = config_data.get('analysisConfig', {})
        nuevo_analisis = AnalisisRealizado(
            id=job_id,
            sha256_archivo=sha256,
            nombre_documento=file_name,
            total_columnas=len(df.columns),
            columna_escogida=excel_col,
            estado=EstadoAnalisis.PROCESANDO,
        )
        db.add(nuevo_analisis)
        db.commit()

        ssl_context = _build_ssl_context()
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)
        timeout = aiohttp.ClientTimeout(total=HTTP_TIMEOUT_SECONDS)

        async def fetch_with_semaphore(session, valor, idx):
            async with semaphore:
                safe_valor = str(valor).replace("'", "''")

                if secop_field in ("id_contrato", "referencia_del_contrato"):
                    params_contratos = {
                        "$limit": 1,
                        "$where": f"id_contrato='{safe_valor}' OR referencia_del_contrato='{safe_valor}'",
                    }
                    params_procesos = {
                        "$limit": 1,
                        "$where": f"id_del_proceso='{safe_valor}' OR referencia_del_proceso='{safe_valor}'",
                    }
                else:
                    params_contratos = {"$limit": 1, secop_field: str(valor)}
                    mapped_field = "referencia_del_proceso" if secop_field == "referencia_del_contrato" else secop_field
                    params_procesos = {"$limit": 1, mapped_field: str(valor)}

                await process_contract(
                    session, URL_CONTRATOS, URL_PROCESOS, params_contratos, params_procesos,
                    valor, idx, total, log_queue, job_id, force_secop
                )
                await asyncio.sleep(0.05)

        async with aiohttp.ClientSession(
            connector=aiohttp.TCPConnector(ssl=ssl_context), timeout=timeout
        ) as session:
            tasks = [fetch_with_semaphore(session, valor, idx) for idx, valor in enumerate(valores_buscar)]
            await asyncio.gather(*tasks)

        # Scraper de Archivos
        run_scraper = config_data.get('runScraper', True)
        if run_scraper:
            from services.pdf_scraper import download_pdfs_for_contract
            
            # Obtener llaves recién insertadas
            contratos_db = db.query(ContratoAnalisis).filter(ContratoAnalisis.id_analisis == job_id).all()
            llaves = [c.llave_busqueda for c in contratos_db]
            
            # Buscar sus URLs en CacheSecop
            caches = db.query(CacheSecop).filter(CacheSecop.llave_busqueda.in_(llaves)).all()
            
            contratos_con_url = []
            for c in caches:
                if c.datos_completos and c.datos_completos.get("urlproceso") and c.datos_completos.get("urlproceso") != "N/A":
                    contratos_con_url.append(c)

            if contratos_con_url:
                await log_queue.put({"type": "log", "message": f"[SCRAPER] Iniciando Robot Navegador (Playwright) para {len(contratos_con_url)} contratos...", "progress": 95})

                for c in contratos_con_url:
                    if job_id in active_cancellations:
                        raise asyncio.CancelledError("Cancelado por el usuario antes de descargar.")
                    try:
                        await download_pdfs_for_contract(
                            job_id, c.llave_busqueda, c.datos_completos.get("urlproceso"), log_queue,
                            active_cancellations=active_cancellations,
                        )
                    except asyncio.CancelledError:
                        raise
                    except Exception as e:
                        await log_queue.put({"type": "log", "message": f"[ERROR SCRAPER] '{c.llave_busqueda}' falló ({e}); continuando."})

        end_time = time.time()
        
        analisis_final = db.query(AnalisisRealizado).filter(AnalisisRealizado.id == job_id).first()
        if analisis_final:
            analisis_final.estado = EstadoAnalisis.COMPLETADO
            analisis_final.tiempo_respuesta = round(end_time - start_time, 2)
            db.commit()

        await log_queue.put({"type": "log", "message": "[OK] Proceso de Auditoría Masiva 100% Completo.", "progress": 100})
        _log_db(db, job_id, "Análisis completado exitosamente.")
        await log_queue.put({"type": "complete"})

    except asyncio.CancelledError:
        await log_queue.put({"type": "error", "message": "[CANCELADO] El proceso fue abortado por el usuario."})
        _log_db(db, job_id, "Análisis cancelado por el usuario.", NivelLog.WARNING)
    except Exception as e:
        logger.exception("Fallo crítico en el worker")
        await log_queue.put({"type": "error", "message": f"[ERROR] Fallo crítico en el worker: {e}"})
        _log_db(db, job_id, f"Fallo crítico en worker: {e}", NivelLog.ERROR)
    finally:
        db.close()

def worker_process_entrypoint(job_id: str, config_data: dict, file_bytes: bytes, mp_queue):
    import asyncio
    async def main():
        log_queue = asyncio.Queue()
        async def forwarder():
            while True:
                msg = await log_queue.get()
                mp_queue.put(msg)
                if msg.get("type") in ("complete", "error"):
                    break
        asyncio.create_task(forwarder())
        try:
            await run_secop_extraction(job_id, config_data, log_queue, file_bytes, set())
        except Exception as e:
            mp_queue.put({"type": "error", "message": f"Fallo crítico en Proceso: {e}"})
    asyncio.run(main())
