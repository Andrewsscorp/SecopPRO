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
from database.models import AnalisisRealizado, CacheSecop, ContratoAnalisis, EstadoAnalisis, LogsServidor, NivelLog, PDFsConsulta

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
            datos_finales = {c.name: getattr(cache_entry, c.name) for c in cache_entry.__table__.columns if c.name != 'datos_adicionales'}
            if getattr(cache_entry, 'datos_adicionales', None):
                datos_finales.update(cache_entry.datos_adicionales)
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
                # Helper para separar las llaves tabuladas de los datos adicionales
                def _build_cache_kwargs(llave, data_dict):
                    # Lista de atributos físicos del modelo CacheSecop
                    tabulated_keys = [
                        "nombre_entidad", "entidad", "nit_entidad", "codigo_entidad", "departamento", "ciudad",
                        "fecha_de_firma", "fecha_de_inicio_del_contrato", "fecha_de_fin_del_contrato", 
                        "duraci_n_del_contrato", "dias_adicionados", "fecha_de_notificaci_n_de_prorrogaci_n", 
                        "el_contrato_puede_ser_prorrogado", "id_contrato", "referencia_del_contrato", 
                        "proceso_de_compra", "internal_id", "descripcion_del_proceso", 
                        "codigo_de_categoria_principal", "condiciones_de_entrega", "justificacion_modalidad_de", 
                        "modalidad_de_contratacion", "tipo_de_contrato", "estado_contrato", "urlproceso", 
                        "proveedor_adjudicado", "es_grupo", "es_pyme", "codigo_proveedor", "documento_proveedor", 
                        "tipodocproveedor", "nombre_representante_legal", "tipo_de_identificaci_n_representante_legal", 
                        "identificaci_n_representante_legal", "nacionalidad_representante_legal", 
                        "domicilio_representante_legal", "g_nero_representante_legal", "telefono_representante_legal", 
                        "tel_fono_representante_legal", "correo_representante_legal", "correo_electronico_representante",
                        "valor_del_contrato", "valor_contrato", "valor_pendiente_de_ejecucion", "valor_pendiente_de", 
                        "valor_pagado", "valor_pendiente_de_pago", "valor_amortizado", "valor_facturado", 
                        "valor_de_pago_adelantado", "saldo_cdp", "saldo_vigencia", "nombre_del_banco", 
                        "tipo_de_cuenta", "n_mero_de_cuenta", "nombre_ordenador_de_pago", "nombre_ordenador_del_gasto", 
                        "nombre_supervisor", "tipo_de_documento_supervisor", "n_mero_de_documento_supervisor",
                        "documentos_tipo", "descripcion_documentos_tipo", "ultima_actualizacion", "liquidaci_n", 
                        "fecha_inicio_liquidacion", "fecha_fin_liquidacion", "obligaci_n_ambiental", 
                        "obligaciones_postconsumo"
                    ]
                    
                    kwargs = {"llave_busqueda": str(llave)}
                    adicionales = {}
                    
                    for k, v in data_dict.items():
                        if k in tabulated_keys:
                            if k == 'urlproceso' and isinstance(v, dict):
                                v = v.get('url', v)
                            kwargs[k] = str(v) if v is not None else "vacía por el momento"
                        else:
                            adicionales[k] = v
                            
                    # Asegurar que las llaves tabuladas que no vinieron queden como "vacía por el momento"
                    for tk in tabulated_keys:
                        if tk not in kwargs:
                            kwargs[tk] = "vacía por el momento"
                            
                    kwargs["datos_adicionales"] = adicionales
                    return kwargs
                
                # Merge si existía en caché
                if cache_entry:
                    # Reconstruir un diccionario completo viejo
                    old_dict = cache_entry.datos_adicionales or {}
                    # Agregarle las llaves tabuladas
                    for col in cache_entry.__table__.columns:
                        if col.name not in ['llave_busqueda', 'datos_adicionales', 'fecha_ultima_actualizacion']:
                            val = getattr(cache_entry, col.name)
                            if val and val != "vacía por el momento":
                                old_dict[col.name] = val
                                
                    merged = merge_jsons(old_dict, raw_data)
                    datos_finales = merged
                    
                    # Actualizar atributos individuales
                    new_kwargs = _build_cache_kwargs(valor, merged)
                    for k, v in new_kwargs.items():
                        setattr(cache_entry, k, v)
                        
                    await log_queue.put({
                        "type": "log",
                        "message": f"[MERGE EXITOSO] '{valor}' actualizado desde SECOP sin perder campos históricos.",
                        "progress": progress,
                    })
                    _log_db(db, job_id, f"Merge de CacheSecop exitoso para '{valor}'.")
                else:
                    new_kwargs = _build_cache_kwargs(valor, raw_data)
                    nueva_cache = CacheSecop(**new_kwargs)
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
            vinculo_existente = db.query(ContratoAnalisis).filter(
                ContratoAnalisis.id_analisis == job_id,
                ContratoAnalisis.llave_busqueda == str(valor)
            ).first()
            if not vinculo_existente:
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
    is_retry: bool = False,
    retry_force_secop: bool = False,
    retry_pdf_strategy: str = 'scrape'
):
    db = SessionLocal()
    loop = asyncio.get_running_loop()
    start_time = time.time()
    try:
        await log_queue.put({"type": "log", "message": "[INFO] Iniciando extracción asíncrona hacia DB Unificada...", "progress": 5})

        if not is_retry:
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
            
            analisis_config = config_data.get('analysisConfig', {})
            raw_name = analisis_config.get('name', '').strip()
            
            nuevo_analisis = AnalisisRealizado(
                id=job_id,
                nombre_analisis=raw_name,
                sha256_archivo=sha256,
                nombre_documento=file_name,
                total_columnas=len(df.columns),
                columna_escogida=excel_col,
                estado=EstadoAnalisis.PROCESANDO,
            )
            db.add(nuevo_analisis)
            db.commit()
        else:
            # Flujo de Reintento
            force_secop = retry_force_secop
            secop_field = "id_contrato" # Asumimos por defecto
            
            # Obtener llaves desde DB
            llaves_db = db.query(ContratoAnalisis).filter(ContratoAnalisis.id_analisis == job_id).all()
            if not llaves_db:
                await log_queue.put({"type": "error", "message": "[ERROR] No hay llaves guardadas para este análisis."})
                return
            valores_buscar = [c.llave_busqueda for c in llaves_db]
            
            analisis_existente = db.query(AnalisisRealizado).filter(AnalisisRealizado.id == job_id).first()
            if analisis_existente:
                analisis_existente.estado = EstadoAnalisis.PROCESANDO
                db.commit()

        total = len(valores_buscar)
        
        _log_db(db, job_id, f"Inicia análisis de {total} registros (Fuerza SECOP: {force_secop})")



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
        if not is_retry:
            pdf_strategy = config_data.get('pdfStrategy', 'scrape') # "copy", "scrape", "ignore"
            run_scraper = config_data.get('runScraper', True)
        else:
            pdf_strategy = retry_pdf_strategy
            run_scraper = True # Siempre corre scraper si no es ignore
            
        if run_scraper and pdf_strategy != 'ignore':
            from services.pdf_scraper import download_pdfs_for_contract
            import shutil
            import pathlib
            import os
            
            # Obtener llaves recién insertadas
            contratos_db = db.query(ContratoAnalisis).filter(ContratoAnalisis.id_analisis == job_id).all()
            llaves = [c.llave_busqueda for c in contratos_db]
            
            # Buscar sus URLs en CacheSecop
            caches = db.query(CacheSecop).filter(CacheSecop.llave_busqueda.in_(llaves)).all()
            
            contratos_con_url = []
            for c in caches:
                # Ahora urlproceso es un atributo directo de la columna
                if c.urlproceso and c.urlproceso != "N/A" and c.urlproceso != "vacía por el momento":
                    contratos_con_url.append(c)

            if contratos_con_url:
                await log_queue.put({"type": "log", "message": f"[SCRAPER] Iniciando orquestador de PDFs para {len(contratos_con_url)} contratos... (Estrategia: {pdf_strategy})", "progress": 95})

                for c in contratos_con_url:
                    if job_id in active_cancellations:
                        raise asyncio.CancelledError("Cancelado por el usuario antes de descargar.")
                    try:
                        llave_safe = str(c.llave_busqueda).replace('/', '_').replace('\\', '_')
                        user_docs = pathlib.Path(os.path.expanduser("~")) / "Documents" / "SecopPRO_Consul" / job_id
                        zip_dest_path = user_docs / "DocumentosDescargados" / f"{llave_safe}.zip"
                        
                        pdf_db_record = db.query(PDFsConsulta).filter(PDFsConsulta.llave_busqueda == c.llave_busqueda).first()
                        
                        ya_copiado = False
                        
                        if pdf_strategy == 'copy' and pdf_db_record and pdf_db_record.ruta_global_zip:
                            global_zip = pathlib.Path(pdf_db_record.ruta_global_zip)
                            if global_zip.exists():
                                zip_dest_path.parent.mkdir(parents=True, exist_ok=True)
                                shutil.copy2(global_zip, zip_dest_path)
                                await log_queue.put({"type": "log", "message": f"[BÓVEDA OK] PDFs copiados instantáneamente para '{c.llave_busqueda}'."})
                                _log_db(db, job_id, f"PDFs copiados desde la bóveda global para '{c.llave_busqueda}'.")
                                ya_copiado = True
                        
                        if not ya_copiado:
                            await log_queue.put({"type": "log", "message": f"[SCRAPER] Navegando para extraer PDFs de '{c.llave_busqueda}'..."})
                            metadata_pdfs = await download_pdfs_for_contract(
                                job_id, c.llave_busqueda, c.urlproceso, log_queue,
                                active_cancellations=active_cancellations,
                            )
                            
                            # Si descargó PDFs y tenemos metadatos, los guardamos en PDFsConsulta
                            if metadata_pdfs and metadata_pdfs.get("cantidad_pdfs", 0) > 0:
                                # Borrar registro viejo si existía
                                if pdf_db_record:
                                    db.delete(pdf_db_record)
                                    db.commit()
                                    
                                nuevo_registro_pdf = PDFsConsulta(
                                    llave_busqueda=c.llave_busqueda,
                                    lista_pdfs=metadata_pdfs["lista_pdfs"],
                                    cantidad_pdfs=metadata_pdfs["cantidad_pdfs"],
                                    sha256_pdfs=metadata_pdfs["sha256_pdfs"],
                                    nombre_zip=metadata_pdfs["nombre_zip"],
                                    ruta_global_zip=metadata_pdfs["ruta_global_zip"]
                                )
                                db.add(nuevo_registro_pdf)
                                db.commit()
                                _log_db(db, job_id, f"Nuevos PDFs guardados en la bóveda global para '{c.llave_busqueda}'.")
                                
                    except asyncio.CancelledError:
                        raise
                    except Exception as e:
                        await log_queue.put({"type": "log", "message": f"[ERROR SCRAPER] '{c.llave_busqueda}' falló ({e}); continuando."})

        # --- NUEVO: PRE-FETCH DE HISTORIAL DE CONTRATISTAS ---
        try:
            from services.contractor_service import fetch_and_summarize_contractor
            
            # Recolectar todos los NITs únicos de los contratos procesados
            contratos_para_nit = db.query(ContratoAnalisis).filter(ContratoAnalisis.id_analisis == job_id).all()
            llaves_nit = [c.llave_busqueda for c in contratos_para_nit]
            caches_nit = db.query(CacheSecop).filter(CacheSecop.llave_busqueda.in_(llaves_nit)).all()
            
            nits_unicos = set()
            for c in caches_nit:
                nit = getattr(c, 'documento_proveedor', None)
                if nit and nit not in ("N/A", "vacía por el momento"):
                    nits_unicos.add(nit)
            
            if nits_unicos:
                await log_queue.put({"type": "log", "message": f"[FORENSE] Pre-cargando historial matemático de {len(nits_unicos)} contratistas...", "progress": 98})
                
                semaforo_prefetch = asyncio.Semaphore(5)
                
                async def _do_prefetch(nit_val):
                    async with semaforo_prefetch:
                        if job_id in active_cancellations:
                            return
                        await fetch_and_summarize_contractor(nit_val, db, force_secop=force_secop)
                        await asyncio.sleep(0.1)
                
                tasks_prefetch = [_do_prefetch(n) for n in nits_unicos]
                await asyncio.gather(*tasks_prefetch)
                
                await log_queue.put({"type": "log", "message": f"[FORENSE] Historial de contratistas guardado en DB exitosamente."})
                _log_db(db, job_id, f"Historial forense pre-cargado para {len(nits_unicos)} NITs.")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            await log_queue.put({"type": "log", "message": f"[AVISO] Falló el pre-fetch forense: {e}"})
            _log_db(db, job_id, f"Error en pre-fetch forense: {e}", NivelLog.WARNING)
        # -----------------------------------------------------

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

def worker_retry_process_entrypoint(job_id: str, force_secop: bool, pdf_strategy: str, mp_queue):
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
            # En reintento pasamos empty dict y None bytes
            await run_secop_extraction(
                job_id, {}, log_queue, None, set(), 
                is_retry=True, retry_force_secop=force_secop, retry_pdf_strategy=pdf_strategy
            )
        except Exception as e:
            mp_queue.put({"type": "error", "message": f"Fallo crítico en Proceso de Reintento: {e}"})
    asyncio.run(main())
