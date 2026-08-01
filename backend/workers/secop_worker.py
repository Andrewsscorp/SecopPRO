"""
secop_extraction_worker.py
---------------------------
Worker asíncrono de extracción masiva SECOP (metadatos + scraper + OCR).

Cambios respecto a la versión original (todos motivados por hallazgos
de auditoría de código):

1. Sesión de SQLAlchemy por tarea concurrente, no compartida.
   `Session` de SQLAlchemy "clásico" (no-async) NO es segura para usarse
   desde múltiples corrutinas en vuelo sobre el mismo objeto. Un fallo de
   flush en una tarea dejaba la sesión compartida en estado inválido y
   degradaba en cascada al resto del batch. Ahora cada llamada a
   `process_contract` abre, usa y cierra su propia sesión.

2. Verificación SSL activada por defecto. Solo se desactiva si se define
   explícitamente `SECOP_INSECURE_SSL=true` en el entorno, y en ese caso
   se deja constancia en el log (tanto en logging como en log_queue) para
   que quede trazado en cualquier auditoría de la propia herramienta.

3. Timeout explícito en la sesión HTTP (`SECOP_HTTP_TIMEOUT_SECONDS`,
   default 30s) para que una conexión colgada no estanque el semáforo y
   congele el batch completo.

4. Reintentos con backoff exponencial para 429/5xx, distinguiendo
   "no encontrado en SECOP" (200 con lista vacía) de "error transitorio
   de la API" (status != 200 tras agotar reintentos). Antes ambos casos
   se reportaban igual como "[AVISO] no encontrado", contaminando
   resultados de auditoría con falsos negativos.

5. Soporte opcional de App Token de Socrata (`SOCRATA_APP_TOKEN`) para
   evitar rate-limiting agresivo con concurrencia alta.

6. Mapeo de campo Excel -> campo Socrata explícito (diccionario cerrado
   de alias conocidos) en vez de heurística por substring
   (`"contrato" in label_lower`), que producía falsos positivos con
   etiquetas como "tipo_de_contrato" o "valor_contrato".

7. Operaciones bloqueantes (lectura de Excel, consultas de cierre de
   fase) movidas a `run_in_executor` para no congelar el event loop
   mientras corren otros jobs en el mismo proceso.

8. `logging.exception(...)` además del mensaje corto al `log_queue`,
   para conservar traceback completo en fallos intermitentes de
   concurrencia.

9. Aislamiento de fallos por contrato en el loop de scraping/OCR: un
   contrato problemático ya no aborta el procesamiento del resto.
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
import pathlib
import re
import ssl

import aiohttp
import pandas as pd

from database.database import SessionLocal, engine, Base
from database.models import Analisis, Contrato, EstadoAnalisis
from services.ocr_engine import analyze_zip_with_ocr

logger = logging.getLogger(__name__)

# Crear tablas si no existen (útil para desarrollo rápido)
Base.metadata.create_all(bind=engine)

# --------------------------------------------------------------------------
# Configuración
# --------------------------------------------------------------------------

URL_CONTRATOS = "https://www.datos.gov.co/resource/jbjy-vk9h.json"
URL_PROCESOS = "https://www.datos.gov.co/resource/p6dx-8zbt.json"

HTTP_TIMEOUT_SECONDS = float(os.environ.get("SECOP_HTTP_TIMEOUT_SECONDS", "30"))
MAX_CONCURRENT_REQUESTS = int(os.environ.get("SECOP_MAX_CONCURRENCY", "10"))
MAX_RETRIES = int(os.environ.get("SECOP_HTTP_MAX_RETRIES", "3"))
RETRY_BASE_DELAY = float(os.environ.get("SECOP_HTTP_RETRY_BASE_DELAY", "1.0"))
SOCRATA_APP_TOKEN = os.environ.get("SOCRATA_APP_TOKEN")  # opcional pero recomendado

# SSL verificado por defecto. Solo se desactiva con opt-in explícito.
_INSECURE_SSL = os.environ.get("SECOP_INSECURE_SSL", "false").lower() == "true"

# Mapeo cerrado y explícito de alias de columna Excel -> campo Socrata.
# Evita falsos positivos de la heurística "in" original (p. ej.
# "tipo_de_contrato" matcheando como si fuera el número de contrato).
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

CATEGORIES_TO_KEEP = {
    "infoBasica": ["id_contrato", "referencia_del_contrato", "nombre_entidad", "nit_entidad", "departamento", "ciudad", "valor_del_contrato", "valor_contrato", "fecha_de_firma", "fecha_de_inicio_del_contrato", "fecha_de_fin_del_contrato", "estado_contrato", "descripcion_del_proceso", "entidad", "estado_del_proceso", "precio_base"],
    "documentos": ["urlproceso", "enlace_al_contrato", "documentos_tipo", "descripcion_documentos_tipo"],
    "ejecucion": ["plazo_de_ejec_del_contrato", "dias_adicionados", "meses_adicionados", "fecha_de_inicio_de_ejecucion", "fecha_de_fin_de_ejecucion", "dias_ejecucion", "meses_ejecucion", "fecha_inicio_liquidacion", "fecha_fin_liquidacion", "duraci_n_del_contrato", "el_contrato_puede_ser_prorrogado", "fecha_de_notificaci_n_de_prorrogaci_n"],
    "supervisor": ["supervisor", "nombre_supervisor", "tipo_de_documento_supervisor", "n_mero_de_documento_supervisor", "nombre_ordenador_del_gasto", "nombre_ordenador_de_pago"],
    "contratista": ["proveedor_adjudicado", "documento_proveedor", "tipo_de_identificaci_n", "es_grupo", "es_pyme", "representante_legal", "nombre_representante_legal", "nacionalidad_representante_legal", "domicilio_representante_legal", "tipo_de_identificaci_n_representante_legal", "identificaci_n_representante_legal", "g_nero_representante_legal", "codigo_proveedor", "nombre_del_banco", "tipo_de_cuenta", "n_mero_de_cuenta"],
    "garantias": ["garantia_exigida", "garantias", "obligaciones_postconsumo", "obligaci_n_ambiental"],
    "pagos": ["valor_pagado", "valor_pendiente_de_pago", "valor_amortizado", "valor_facturado", "valor_de_pago_adelantado", "valor_pendiente_de", "valor_pendiente_de_ejecucion", "saldo_cdp", "saldo_vigencia", "liquidaci_n"],
    "licitaciones": ["modalidad_de_contratacion", "tipo_de_contrato", "proceso_de_compra", "justificacion_modalidad_de", "codigo_de_categoria_principal", "codigo_entidad", "condiciones_de_entrega", "tipodocproveedor"],
}


# --------------------------------------------------------------------------
# HTTP helpers
# --------------------------------------------------------------------------

def _build_ssl_context() -> ssl.SSLContext:
    if _INSECURE_SSL:
        logger.warning(
            "SECOP_INSECURE_SSL=true: la verificación de certificados SSL "
            "está DESACTIVADA para las llamadas a datos.gov.co. Esto expone "
            "el proceso a ataques de tipo MITM. Usar solo temporalmente y "
            "solo si es estrictamente necesario."
        )
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


async def _fetch_json_with_retries(
    session: aiohttp.ClientSession, url: str, params: dict, log_queue: asyncio.Queue, context_label: str
):
    """
    GET con reintentos y backoff exponencial para 429/5xx.

    Devuelve (status, data) donde:
      - status == 200 y data es la lista/objeto JSON en caso de éxito.
      - status != 200 tras agotar reintentos: data es None. El llamador
        debe distinguir esto de un "no encontrado" real (200 con lista
        vacía).
    """
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
                    logger.info(
                        "[%s] status %s en intento %s/%s, reintentando en %.1fs",
                        context_label, response.status, attempt + 1, MAX_RETRIES, delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                # Error no reintentable (4xx que no sea 429) o reintentos agotados
                return response.status, None
        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            last_status = "network_error"
            if attempt < MAX_RETRIES:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                logger.warning(
                    "[%s] error de red (%s) en intento %s/%s, reintentando en %.1fs",
                    context_label, exc, attempt + 1, MAX_RETRIES, delay,
                )
                await asyncio.sleep(delay)
                continue
            logger.exception("[%s] error de red tras agotar reintentos", context_label)
            await log_queue.put({
                "type": "log",
                "message": f"[RED] '{context_label}': fallo de conexión tras {MAX_RETRIES} reintentos ({exc})",
            })
            return last_status, None
    return last_status, None


# --------------------------------------------------------------------------
# Procesamiento de un contrato individual
# --------------------------------------------------------------------------

async def process_contract(
    session, url_contratos, url_procesos, params_contratos, params_procesos,
    valor, idx, total, log_queue, job_id, toggles,
):
    """
    Procesa un único término de búsqueda. Abre y cierra su propia sesión
    de base de datos para ser segura frente a ejecución concurrente.
    """
    db = SessionLocal()
    try:
        status, data = await _fetch_json_with_retries(
            session, url_contratos, params_contratos, log_queue, f"Contratos:{valor}"
        )

        contrato_data = None
        is_fallback = False
        api_error = False

        if status == 200 and data:
            contrato_data = data[0]
        elif status != 200:
            api_error = True
        else:
            # status == 200 pero lista vacía -> intentar fallback de Procesos
            status2, data2 = await _fetch_json_with_retries(
                session, url_procesos, params_procesos, log_queue, f"Procesos:{valor}"
            )
            if status2 == 200 and data2:
                raw_proceso = data2[0]
                is_fallback = True
                contrato_data = {
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
            elif status2 != 200:
                api_error = True

        progress = 30 + int(((idx + 1) / total) * 60)

        if contrato_data:
            keys_to_keep = set()
            for category, is_active in toggles.items():
                if is_active:
                    keys_to_keep.update(CATEGORIES_TO_KEEP.get(category, []))

            filtered_data = {k: v for k, v in contrato_data.items() if k in keys_to_keep}
            entidad = contrato_data.get("nombre_entidad", contrato_data.get("entidad", "Entidad desconocida"))

            nuevo_contrato = Contrato(
                id_analisis=job_id,
                llave_busqueda=valor,
                datos_secop=filtered_data,
            )
            db.add(nuevo_contrato)
            db.commit()

            await log_queue.put({
                "type": "log",
                "message": f"[ÉXITO SECOP] '{valor}': {entidad[:40]} {'(Fallback)' if is_fallback else ''}",
                "progress": progress,
            })
        elif api_error:
            # Distinguido explícitamente de "no encontrado": esto es un
            # fallo transitorio de la API, no una ausencia real del dato.
            await log_queue.put({
                "type": "log",
                "message": f"[ERROR API] '{valor}' no se pudo consultar (status={status}). "
                            f"No confirmado como ausente en SECOP.",
                "progress": progress,
            })
        else:
            await log_queue.put({
                "type": "log",
                "message": f"[AVISO] '{valor}' no encontrado en SECOP",
                "progress": progress,
            })

    except Exception as e:  # noqa: BLE001
        db.rollback()
        logger.exception("Excepción procesando '%s'", valor)
        await log_queue.put({"type": "error", "message": f"[ERROR] Excepción con {valor}: {str(e)}"})
    finally:
        db.close()


# --------------------------------------------------------------------------
# Worker principal
# --------------------------------------------------------------------------

def _resolve_secop_field(raw_secop_field: str) -> str:
    """Mapeo explícito y cerrado; sin heurística de substring."""
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
    try:
        await log_queue.put({"type": "log", "message": "[INFO] Iniciando extracción masiva asíncrona hacia SQLite...", "progress": 5})

        # 1. Configuración y Mapeo
        mapped_columns = config_data.get('mappedColumns', [])
        key_mapping = next((col for col in mapped_columns if col.get('isKey')), None)

        if not key_mapping:
            await log_queue.put({"type": "error", "message": "[ERROR] No se seleccionó ninguna Llave Primaria en la configuración."})
            return

        excel_col = key_mapping['excelCol']
        raw_secop_field = key_mapping['secopField'] or 'id_contrato'
        secop_field = _resolve_secop_field(raw_secop_field)

        await log_queue.put({"type": "log", "message": f"[OK] Llave validada: Socrata API -> '{secop_field}'", "progress": 15})

        # 2. Leer Excel (bloqueante -> executor, para no congelar el loop)
        try:
            df = await loop.run_in_executor(None, lambda: pd.read_excel(io.BytesIO(file_bytes)))
        except Exception as e:  # noqa: BLE001
            logger.exception("No se pudo leer el Excel")
            await log_queue.put({"type": "error", "message": f"[ERROR] No se pudo leer el Excel: {str(e)}"})
            return

        if excel_col not in df.columns:
            await log_queue.put({"type": "error", "message": f"[ERROR] La columna '{excel_col}' no existe en el Excel."})
            return

        valores_buscar = df[excel_col].dropna().astype(str).unique().tolist()
        total = len(valores_buscar)

        if total == 0:
            await log_queue.put({"type": "error", "message": f"[ERROR] La columna '{excel_col}' está vacía."})
            return

        await log_queue.put({"type": "log", "message": f"[INFO] Preparando {total} registros para descarga paralela...", "progress": 25})

        # 3. Registrar Análisis en BD
        analisis_config = config_data.get('analysisConfig', {})
        nuevo_analisis = Analisis(
            id=job_id,
            nombre=analisis_config.get('name', 'Análisis Batch'),
            fecha_corte=analisis_config.get('cutOffDate', ''),
            estado=EstadoAnalisis.PROCESANDO,
        )
        db.add(nuevo_analisis)
        db.commit()

        # 4. Extracción Concurrente (Async/Await)
        ssl_context = _build_ssl_context()
        toggles = config_data.get('configToggles', {})
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
                    valor, idx, total, log_queue, job_id, toggles,
                )
                await asyncio.sleep(0.05)

        async with aiohttp.ClientSession(
            connector=aiohttp.TCPConnector(ssl=ssl_context), timeout=timeout
        ) as session:
            tasks = [fetch_with_semaphore(session, valor, idx) for idx, valor in enumerate(valores_buscar)]
            await asyncio.gather(*tasks)

        # 5. Finalizar y Guardar Metadatos SQLite
        nuevo_analisis.estado = EstadoAnalisis.COMPLETADO
        db.commit()

        await log_queue.put({"type": "log", "message": "[OK] ¡Metadatos extraídos! El Dashboard ya puede visualizarse.", "progress": 90})

        if job_id in active_cancellations:
            raise asyncio.CancelledError("Cancelado por el usuario tras la extracción de metadatos.")

        run_scraper = config_data.get('runScraper', True)
        if not run_scraper:
            await log_queue.put({"type": "log", "message": "[AVISO] Extracción profunda (Scraper + OCR) omitida por el usuario. Finalizando análisis rápido.", "progress": 100})
            await log_queue.put({"type": "complete"})
            return

        # 6. Scraper Real (Background Físico)
        from services.pdf_scraper import download_pdfs_for_contract

        contratos_db = await loop.run_in_executor(
            None, lambda: db.query(Contrato).filter(Contrato.id_analisis == job_id).all()
        )
        contratos_con_url = [
            c for c in contratos_db
            if c.datos_secop and c.datos_secop.get("urlproceso") and c.datos_secop.get("urlproceso") != "N/A"
        ]

        if contratos_con_url:
            await log_queue.put({"type": "log", "message": f"[SCRAPER] Iniciando Robot Navegador (Playwright) para {len(contratos_con_url)} contratos...", "progress": 95})

            search_term = config_data.get("ocrSearchTerm", "").strip()

            for c in contratos_con_url:
                if job_id in active_cancellations:
                    raise asyncio.CancelledError("Cancelado por el usuario antes de descargar un nuevo contrato.")

                try:
                    await download_pdfs_for_contract(
                        job_id, c.llave_busqueda, c.datos_secop.get("urlproceso"), log_queue,
                        active_cancellations=active_cancellations,
                    )

                    if job_id in active_cancellations:
                        raise asyncio.CancelledError("Cancelado por el usuario antes del OCR.")

                    if search_term:
                        llave_safe = re.sub(r'[\\/*?:"<>|]', '_', c.llave_busqueda)
                        user_docs = pathlib.Path(os.path.expanduser('~')) / 'Documents' / 'SecopPRO_Consul' / job_id
                        zip_path = str(user_docs / 'DocumentosDescargados' / f"{llave_safe}.zip")

                        if os.path.exists(zip_path):
                            await log_queue.put({"type": "log", "message": f"[OCR] 🤖 Analizando '{c.llave_busqueda}' con OCR + IA Local (Buscando: {search_term})..."})
                            ocr_result = await loop.run_in_executor(None, analyze_zip_with_ocr, zip_path, search_term)

                            if ocr_result and "matches" in ocr_result and len(ocr_result["matches"]) > 0:
                                num = len(ocr_result["matches"])
                                await log_queue.put({"type": "log", "message": f"🔥 [HALLAZGO OCR] ¡'{search_term}' encontrado en {num} archivos de este proceso!"})

                                datos_act = dict(c.datos_secop) if c.datos_secop else {}
                                datos_act['ocr_matches'] = ocr_result["matches"]
                                c.datos_secop = datos_act
                                db.commit()
                            elif ocr_result and "error" in ocr_result:
                                await log_queue.put({"type": "log", "message": f"🤖 [OCR WARNING] {ocr_result['error']}"})
                            else:
                                await log_queue.put({"type": "log", "message": f"🤖 [OCR] No hubo coincidencias difusas (>85%) en este contrato."})
                        else:
                            await log_queue.put({"type": "log", "message": f"🤖 [OCR ERROR] No se pudo analizar {c.llave_busqueda} porque el ZIP no se descargó correctamente en {zip_path}."})

                except asyncio.CancelledError:
                    raise
                except Exception as e:  # noqa: BLE001
                    # Aislar el fallo a este contrato: no abortar el resto del batch.
                    logger.exception("Fallo procesando scraper/OCR para '%s'", c.llave_busqueda)
                    db.rollback()
                    await log_queue.put({
                        "type": "log",
                        "message": f"[ERROR SCRAPER] '{c.llave_busqueda}' falló ({e}); continuando con el resto.",
                    })
        else:
            await log_queue.put({"type": "log", "message": "[SCRAPER WARNING] No se encontraron contratos con URLs válidas en Socrata para descargar PDFs."})

        await log_queue.put({"type": "log", "message": "[OK] Proceso de Auditoría Masiva 100% Completo.", "progress": 100})
        await log_queue.put({"type": "complete"})

    except asyncio.CancelledError:
        await log_queue.put({"type": "error", "message": "[CANCELADO] El proceso fue abortado por el usuario de forma segura."})
    except Exception as e:  # noqa: BLE001
        db.rollback()
        logger.exception("Fallo crítico en el worker de extracción SECOP")
        await log_queue.put({"type": "error", "message": f"[ERROR] Fallo crítico en el worker: {str(e)}"})
    finally:
        db.close()


def worker_process_entrypoint(job_id: str, config_data: dict, file_bytes: bytes, mp_queue):
    """
    Punto de entrada para ejecutar la extracción en un Proceso de Sistema aislado (PID).
    """
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
        
        # Usamos un set vacío de cancelaciones, porque la cancelación ahora es matar el PID (SIGTERM)
        try:
            await run_secop_extraction(job_id, config_data, log_queue, file_bytes, set())
        except Exception as e:
            mp_queue.put({"type": "error", "message": f"Fallo crítico en el Proceso Aislado: {str(e)}"})
            
    asyncio.run(main())

