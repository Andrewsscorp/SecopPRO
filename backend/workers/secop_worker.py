import asyncio
import json
import io
import pandas as pd
import aiohttp
import ssl
import re
import os
import pathlib

from database.database import SessionLocal, engine, Base
from database.models import Analisis, Contrato, EstadoAnalisis
from services.ocr_engine import analyze_zip_with_ocr

# Crear tablas si no existen (útil para desarrollo rápido)
Base.metadata.create_all(bind=engine)

async def process_contract(session, url_contratos, url_procesos, params_contratos, params_procesos, valor, idx, total, log_queue, db, job_id, toggles):
    try:
        # PRIMER INTENTO: API de Contratos
        async with session.get(url_contratos, params=params_contratos) as response:
            data = None
            if response.status == 200:
                data = await response.json()
                
            contrato_data = None
            is_fallback = False
            
            if data and len(data) > 0:
                contrato_data = data[0]
            else:
                # SEGUNDO INTENTO: API de Procesos (Fallback)
                async with session.get(url_procesos, params=params_procesos) as response2:
                    if response2.status == 200:
                        data2 = await response2.json()
                        if data2 and len(data2) > 0:
                            raw_proceso = data2[0]
                            is_fallback = True
                            
                            # Normalizar campos de Proceso -> Contrato
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
                                # Licitaciones
                                "modalidad_de_contratacion": raw_proceso.get("modalidad_de_contratacion"),
                                "tipo_de_contrato": raw_proceso.get("tipo_de_contrato"),
                            }
                            
            if contrato_data:
                # ---------------------------------------------------------
                # LÓGICA DE FILTRADO POR TOGGLES (WHITELIST APPROACH)
                # ---------------------------------------------------------
                CATEGORIES_TO_KEEP = {
                    "infoBasica": ["id_contrato", "referencia_del_contrato", "nombre_entidad", "nit_entidad", "departamento", "ciudad", "valor_del_contrato", "valor_contrato", "fecha_de_firma", "fecha_de_inicio_del_contrato", "fecha_de_fin_del_contrato", "estado_contrato", "descripcion_del_proceso", "entidad", "estado_del_proceso", "precio_base"],
                    "documentos": ["urlproceso", "enlace_al_contrato", "documentos_tipo", "descripcion_documentos_tipo"],
                    "ejecucion": ["plazo_de_ejec_del_contrato", "dias_adicionados", "meses_adicionados", "fecha_de_inicio_de_ejecucion", "fecha_de_fin_de_ejecucion", "dias_ejecucion", "meses_ejecucion", "fecha_inicio_liquidacion", "fecha_fin_liquidacion", "duraci_n_del_contrato", "el_contrato_puede_ser_prorrogado", "fecha_de_notificaci_n_de_prorrogaci_n"],
                    "supervisor": ["supervisor", "nombre_supervisor", "tipo_de_documento_supervisor", "n_mero_de_documento_supervisor", "nombre_ordenador_del_gasto", "nombre_ordenador_de_pago"],
                    "contratista": ["proveedor_adjudicado", "documento_proveedor", "tipo_de_identificaci_n", "es_grupo", "es_pyme", "representante_legal", "nombre_representante_legal", "nacionalidad_representante_legal", "domicilio_representante_legal", "tipo_de_identificaci_n_representante_legal", "identificaci_n_representante_legal", "g_nero_representante_legal", "codigo_proveedor", "nombre_del_banco", "tipo_de_cuenta", "n_mero_de_cuenta"],
                    "garantias": ["garantia_exigida", "garantias", "obligaciones_postconsumo", "obligaci_n_ambiental"],
                    "pagos": ["valor_pagado", "valor_pendiente_de_pago", "valor_amortizado", "valor_facturado", "valor_de_pago_adelantado", "valor_pendiente_de", "valor_pendiente_de_ejecucion", "saldo_cdp", "saldo_vigencia", "liquidaci_n"],
                    "licitaciones": ["modalidad_de_contratacion", "tipo_de_contrato", "proceso_de_compra", "justificacion_modalidad_de", "codigo_de_categoria_principal", "codigo_entidad", "condiciones_de_entrega", "tipodocproveedor"]
                }
                
                keys_to_keep = set()
                for category, is_active in toggles.items():
                    if is_active:
                        keys_to_keep.update(CATEGORIES_TO_KEEP.get(category, []))
                        
                filtered_data = {k: v for k, v in contrato_data.items() if k in keys_to_keep}
                
                # La API Socrata usa "nombre_entidad" para el SECOP II
                entidad = contrato_data.get("nombre_entidad", contrato_data.get("entidad", "Entidad desconocida"))
                
                # Persistir en SQLite
                nuevo_contrato = Contrato(
                    id_analisis=job_id,
                    llave_busqueda=valor,
                    datos_secop=filtered_data
                )
                db.add(nuevo_contrato)
                
                await log_queue.put({
                    "type": "log", 
                    "message": f"[ÉXITO SECOP] '{valor}': {entidad[:40]} {'(Fallback)' if is_fallback else ''}", 
                    "progress": 30 + int(((idx+1)/total) * 60)
                })
            else:
                await log_queue.put({"type": "log", "message": f"[AVISO] '{valor}' no encontrado en SECOP", "progress": 30 + int(((idx+1)/total) * 60)})
    except Exception as e:
        await log_queue.put({"type": "error", "message": f"[ERROR] Excepción con {valor}: {str(e)}"})

async def run_secop_extraction(job_id: str, config_data: dict, log_queue: asyncio.Queue, file_bytes: bytes):
    db = SessionLocal()
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
        
        label_lower = raw_secop_field.lower()
        if "mero" in label_lower or "contrato" in label_lower:
            secop_field = "id_contrato"
        elif "referencia" in label_lower:
            secop_field = "referencia_del_contrato"
        elif "nit" in label_lower or "documento" in label_lower:
            secop_field = "documento_proveedor"
        else:
            secop_field = raw_secop_field
            
        await log_queue.put({"type": "log", "message": f"[OK] Llave validada: Socrata API -> '{secop_field}'", "progress": 15})
        
        # 2. Leer Excel
        try:
            df = pd.read_excel(io.BytesIO(file_bytes))
        except Exception as e:
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
            estado=EstadoAnalisis.PROCESANDO
        )
        db.add(nuevo_analisis)
        db.commit()
        
        # 4. Extracción Concurrente (Async/Await)
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        
        # Extraer los toggles de la configuración enviada por el Frontend
        toggles = config_data.get('configToggles', {})
        
        # Limitar a 10 conexiones simultáneas para no saturar Socrata
        semaphore = asyncio.Semaphore(10)
        url_contratos = "https://www.datos.gov.co/resource/jbjy-vk9h.json"
        url_procesos = "https://www.datos.gov.co/resource/p6dx-8zbt.json"
        
        async def fetch_with_semaphore(session, valor, idx):
            async with semaphore:
                safe_valor = str(valor).replace("'", "''")
                
                if secop_field == "id_contrato" or secop_field == "referencia_del_contrato":
                    # Búsqueda híbrida: intentar hacer match con id_contrato o referencia_del_contrato
                    params_contratos = {
                        "$limit": 1,
                        "$where": f"id_contrato='{safe_valor}' OR referencia_del_contrato='{safe_valor}'"
                    }
                    params_procesos = {
                        "$limit": 1,
                        "$where": f"id_del_proceso='{safe_valor}' OR referencia_del_proceso='{safe_valor}'"
                    }
                else:
                    params_contratos = {"$limit": 1, secop_field: str(valor)}
                    # Para Procesos, el nombre del campo puede variar, pero lo intentamos igual
                    mapped_field = "referencia_del_proceso" if secop_field == "referencia_del_contrato" else secop_field
                    params_procesos = {"$limit": 1, mapped_field: str(valor)}
                    
                await process_contract(session, url_contratos, url_procesos, params_contratos, params_procesos, valor, idx, total, log_queue, db, job_id, toggles)
                # Pequeña pausa para no sobrecargar el hilo local
                await asyncio.sleep(0.05)
                
        async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=ssl_context)) as session:
            tasks = [fetch_with_semaphore(session, valor, idx) for idx, valor in enumerate(valores_buscar)]
            # Ejecutar todas las peticiones concurrentemente
            await asyncio.gather(*tasks)
            
        # 5. Finalizar y Guardar Metadatos SQLite
        nuevo_analisis.estado = EstadoAnalisis.COMPLETADO
        db.commit()
        
        await log_queue.put({"type": "log", "message": "[OK] ¡Metadatos extraídos! El Dashboard ya puede visualizarse.", "progress": 90})
        
        # 6. Scraper Real (Background Físico)
        from services.pdf_scraper import download_pdfs_for_contract
        
        contratos_db = db.query(Contrato).filter(Contrato.id_analisis == job_id).all()
        contratos_con_url = [c for c in contratos_db if c.datos_secop and c.datos_secop.get("urlproceso") and c.datos_secop.get("urlproceso") != "N/A"]
        
        if contratos_con_url:
            await log_queue.put({"type": "log", "message": f"[SCRAPER] Iniciando Robot Navegador (Playwright) para {len(contratos_con_url)} contratos...", "progress": 95})
            
            search_term = config_data.get("ocrSearchTerm", "").strip()
            
            for c in contratos_con_url:
                # Disparar scraping asíncrono para descargar anexos PDF reales
                await download_pdfs_for_contract(job_id, c.llave_busqueda, c.datos_secop.get("urlproceso"), log_queue)
                
                # Inyección OCR
                if search_term:
                    llave_safe = re.sub(r'[\\/*?:"<>|]', '_', c.llave_busqueda)
                    user_docs = pathlib.Path(os.path.expanduser('~')) / 'Documents' / 'SecopPRO_Consul' / job_id
                    zip_path = str(user_docs / 'DocumentosDescargados' / f"{llave_safe}.zip")
                    
                    if os.path.exists(zip_path):
                        await log_queue.put({"type": "log", "message": f"[OCR] 🤖 Analizando '{c.llave_busqueda}' con OCR + IA Local (Buscando: {search_term})..."})
                        loop = asyncio.get_running_loop()
                        ocr_result = await loop.run_in_executor(None, analyze_zip_with_ocr, zip_path, search_term)
                        
                        if ocr_result and "matches" in ocr_result and len(ocr_result["matches"]) > 0:
                            num = len(ocr_result["matches"])
                            await log_queue.put({"type": "log", "message": f"🔥 [HALLAZGO OCR] ¡'{search_term}' encontrado en {num} archivos de este proceso!"})
                            
                            # Actualizar Base de Datos con el hallazgo
                            datos_act = dict(c.datos_secop) if c.datos_secop else {}
                            datos_act['ocr_matches'] = ocr_result["matches"]
                            c.datos_secop = datos_act
                            db.commit()
                        elif "error" in ocr_result:
                            await log_queue.put({"type": "log", "message": f"🤖 [OCR WARNING] {ocr_result['error']}"})
                        else:
                            await log_queue.put({"type": "log", "message": f"🤖 [OCR] No hubo coincidencias difusas (>{85}%) en este contrato."})
                    else:
                        await log_queue.put({"type": "log", "message": f"🤖 [OCR ERROR] No se pudo analizar {c.llave_busqueda} porque el ZIP no se descargó correctamente en {zip_path}."})
        else:
            await log_queue.put({"type": "log", "message": "[SCRAPER WARNING] No se encontraron contratos con URLs válidas en Socrata para descargar PDFs."})
                
        await log_queue.put({"type": "log", "message": "[OK] Proceso de Auditoría Masiva 100% Completo.", "progress": 100})
        await log_queue.put({"type": "complete"})
        
    except Exception as e:
        db.rollback()
        await log_queue.put({"type": "error", "message": f"[ERROR] Fallo crítico en el worker: {str(e)}"})
    finally:
        db.close()
