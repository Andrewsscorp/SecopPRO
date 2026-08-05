from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import or_
import uuid
import asyncio
import aiohttp
import ssl
from datetime import datetime
import json
import hashlib

from database.database import get_db, SessionLocal
from database.models import AnalisisRealizado, EstadoAnalisis, CacheSecop, ContratoAnalisis, SecopIBruto

router = APIRouter()

SOCRATA_SECOP2_URL = "https://www.datos.gov.co/resource/jbjy-vk9h.json"
SOCRATA_SECOP1_URL = "https://www.datos.gov.co/resource/f789-7hwg.json"

async def fetch_socrata(session, url, params):
    try:
        async with session.get(url, params=params) as resp:
            if resp.status != 200:
                text = await resp.text()
                print(f"Socrata error {resp.status} on {url}: {text}")
                return []
            return await resp.json()
    except Exception as e:
        print(f"Exception fetching {url}: {e}")
        return []

def extract_url(item, field_name):
    raw_url = item.get(field_name)
    if isinstance(raw_url, dict):
        return raw_url.get("url")
    return raw_url

def parse_float(val):
    try:
        return float(val) if val else 0.0
    except:
        return 0.0

def parse_int(val):
    try:
        return int(val) if val else 0
    except:
        return 0

def get_hash(params_dict):
    s = json.dumps(params_dict, sort_keys=True)
    return hashlib.sha256(s.encode('utf-8')).hexdigest()

def background_socrata_fetcher(job_id: str, query_secop1: str, query_secop2: str):
    asyncio.run(_async_background_fetcher(job_id, query_secop1, query_secop2))

async def _async_background_fetcher(job_id: str, query_secop1: str, query_secop2: str):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    offset_s1 = 500
    offset_s2 = 500
    limit = 1000
    
    keep_fetching_s1 = True
    keep_fetching_s2 = True
    
    db = SessionLocal()
    analisis = db.query(AnalisisRealizado).filter(AnalisisRealizado.id == job_id).first()
    if not analisis:
        db.close()
        return

    async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=ctx)) as session:
        while keep_fetching_s1 or keep_fetching_s2:
            tasks = []
            
            if keep_fetching_s2:
                p2 = {"$where": query_secop2, "$limit": limit, "$offset": offset_s2, "$order": "fecha_de_firma DESC"}
                tasks.append(fetch_socrata(session, SOCRATA_SECOP2_URL, p2))
            else:
                tasks.append(asyncio.sleep(0))
                
            if keep_fetching_s1:
                p1 = {"$where": query_secop1, "$limit": limit, "$offset": offset_s1, "$order": "fecha_de_firma_del_contrato DESC"}
                tasks.append(fetch_socrata(session, SOCRATA_SECOP1_URL, p1))
            else:
                tasks.append(asyncio.sleep(0))
                
            results = await asyncio.gather(*tasks)
            data_s2 = results[0] if keep_fetching_s2 else []
            data_s1 = results[1] if keep_fetching_s1 else []
            
            if len(data_s2) < limit:
                keep_fetching_s2 = False
            if len(data_s1) < limit:
                keep_fetching_s1 = False
                
            offset_s2 += limit
            offset_s1 += limit
            
            if not data_s1 and not data_s2:
                break
                
            seen_keys = set()
            new_count = 0
            
            for item in data_s2:
                llave = item.get("proceso_de_compra")
                if not llave or llave in seen_keys: continue
                seen_keys.add(llave)
                
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
                        urlproceso=extract_url(item, "urlproceso"),
                        fecha_de_inicio_del_contrato=item.get("fecha_de_inicio_del_contrato"),
                        fecha_de_fin_del_contrato=item.get("fecha_de_fin_del_contrato"),
                        datos_adicionales=item
                    )
                    db.add(cache_entry)
                
                link = db.query(ContratoAnalisis).filter_by(id_analisis=job_id, llave_busqueda=llave).first()
                if not link:
                    db.add(ContratoAnalisis(id_analisis=job_id, llave_busqueda=llave))
                    new_count += 1
            
            for item in data_s1:
                llave = item.get("uid")
                if not llave or llave in seen_keys: continue
                seen_keys.add(llave)
                
                doc_proveedor = item.get("identificacion_del_contratista") or item.get("identific_representante_legal")
                
                secop1_entry = db.query(SecopIBruto).filter(SecopIBruto.uid == llave).first()
                if not secop1_entry:
                    secop1_entry = SecopIBruto(
                        uid=llave,
                        anno_cargue=item.get("anno_cargue_secop"),
                        numero_constancia=item.get("numero_de_constancia"),
                        numero_proceso=item.get("numero_de_proceso"),
                        numero_contrato=item.get("numero_de_contrato"),
                        nivel_entidad=item.get("nivel_entidad"),
                        orden_entidad=item.get("orden_entidad"),
                        nombre_entidad=item.get("nombre_entidad"),
                        nit_entidad=item.get("nit_de_la_entidad"),
                        codigo_entidad=item.get("c_digo_de_la_entidad"),
                        departamento_entidad=item.get("departamento_entidad"),
                        municipio_entidad=item.get("municipio_entidad"),
                        estado_proceso=item.get("estado_del_proceso"),
                        tipo_proceso=item.get("modalidad_de_contratacion"),
                        regimen_contratacion=item.get("nombre_regimen_de_contratacion"),
                        objeto_contratar=item.get("objeto_a_contratar"),
                        detalle_objeto=item.get("detalle_del_objeto_a_contratar"),
                        tipo_contrato=item.get("tipo_de_contrato"),
                        causal_otras_compras=item.get("causal_de_otras_formas_de"),
                        id_grupo=item.get("id_grupo"),
                        nombre_grupo=item.get("nombre_grupo"),
                        id_familia=item.get("id_familia"),
                        nombre_familia=item.get("nombre_familia"),
                        id_clase=item.get("id_clase"),
                        nombre_clase=item.get("nombre_clase"),
                        tipo_identificacion=item.get("tipo_identifi_del_contratista"),
                        identificacion=item.get("identificacion_del_contratista"),
                        nombre_contratista=item.get("nom_razon_social_contratista"),
                        dpto_mpio_contratista=item.get("dpto_y_muni_contratista"),
                        tipo_doc_representante=item.get("tipo_doc_representante_legal"),
                        identificacion_representante=item.get("identific_representante_legal"),
                        nombre_representante=item.get("nombre_del_represen_legal"),
                        cuantia_proceso=parse_float(item.get("cuantia_proceso")),
                        cuantia_contrato=parse_float(item.get("cuantia_contrato")),
                        valor_total_adiciones=parse_float(item.get("valor_total_de_adiciones")),
                        cuantia_definitiva=parse_float(item.get("valor_contrato_con_adiciones")),
                        compromiso_presupuestal=item.get("compromiso_presupuestal"),
                        destinacion_gasto=item.get("destino_gasto"),
                        fecha_cargue=item.get("fecha_de_cargue_en_el_secop"),
                        anno_firma=item.get("anno_firma_contrato"),
                        fecha_firma=item.get("fecha_de_firma_del_contrato"),
                        fecha_ini_ejec_contrato=item.get("fecha_ini_ejec_contrato"),
                        plazo_ejecucion=parse_int(item.get("plazo_de_ejec_del_contrato")),
                        rango_ejecucion=item.get("rango_de_ejec_del_contrato", "Dias"),
                        tiempo_adiciones=parse_int(item.get("tiempo_adiciones_en_dias")),
                        rango_adiciones="Dias",
                        fecha_plazo=item.get("fecha_fin_ejec_contrato"),
                        fecha_liquidacion=item.get("ultima_actualizacion"),
                        departamento_ejecucion=None,
                        municipio_ejecucion=item.get("municipios_ejecucion"),
                        ruta_web=extract_url(item, "ruta_proceso_en_secop_i")
                    )
                    db.add(secop1_entry)
                
                cache_entry = db.query(CacheSecop).filter(CacheSecop.llave_busqueda == llave).first()
                if not cache_entry:
                    cache_entry = CacheSecop(
                        llave_busqueda=llave,
                        nombre_entidad=item.get("nombre_entidad"),
                        nit_entidad=item.get("nit_de_la_entidad"),
                        ciudad=item.get("municipios_ejecucion"),
                        fecha_de_firma=item.get("fecha_de_firma_del_contrato"),
                        proveedor_adjudicado=item.get("nom_razon_social_contratista"),
                        documento_proveedor=doc_proveedor,
                        valor_del_contrato=item.get("cuantia_contrato"),
                        descripcion_del_proceso=item.get("detalle_del_objeto_a_contratar", item.get("objeto_a_contratar")),
                        estado_contrato=item.get("estado_del_proceso"),
                        urlproceso=extract_url(item, "ruta_proceso_en_secop_i"),
                        fecha_de_inicio_del_contrato=item.get("fecha_ini_ejec_contrato"),
                        fecha_de_fin_del_contrato=item.get("fecha_fin_ejec_contrato"),
                        datos_adicionales={"SECOP_I_BRUTO": True}
                    )
                    db.add(cache_entry)
                
                link = db.query(ContratoAnalisis).filter_by(id_analisis=job_id, llave_busqueda=llave).first()
                if not link:
                    db.add(ContratoAnalisis(id_analisis=job_id, llave_busqueda=llave))
                    new_count += 1
            
            try:
                analisis.progreso_descarga = (analisis.progreso_descarga or 0) + new_count
                db.commit()
            except Exception as e:
                db.rollback()
                print("Error saving background chunk:", e)
    
    try:
        analisis.estado = EstadoAnalisis.COMPLETADO
        db.commit()
    except:
        pass
    finally:
        db.close()

@router.get("/direct")
async def direct_search(
    background_tasks: BackgroundTasks,
    nombre: str = None,
    documento: str = None,
    ciudad: str = None,
    palabra_clave: str = None,
    codigo_unspsc: str = None,
    fecha_inicio: str = None,
    fecha_fin: str = None,
    db: Session = Depends(get_db)
):
    params_dict = {
        "nombre": nombre, "documento": documento, "ciudad": ciudad,
        "palabra_clave": palabra_clave, "codigo_unspsc": codigo_unspsc,
        "fecha_inicio": fecha_inicio, "fecha_fin": fecha_fin
    }
    
    if not any(params_dict.values()):
        raise HTTPException(status_code=400, detail="Debe proveer al menos un criterio de búsqueda.")

    search_hash = get_hash(params_dict)
    existing_job = db.query(AnalisisRealizado).filter(AnalisisRealizado.parametros_busqueda == search_hash).first()
    
    if existing_job:
        count = db.query(ContratoAnalisis).filter(ContratoAnalisis.id_analisis == existing_job.id).count()
        return {
            "job_id": existing_job.id,
            "count": count,
            "message": "Resultados cargados desde caché local."
        }

    where_secop2 = []
    if nombre: where_secop2.append(f"(upper(nombre_entidad) like upper('%{nombre}%') OR upper(proveedor_adjudicado) like upper('%{nombre}%'))")
    if documento: where_secop2.append(f"documento_proveedor = '{documento}'")
    if ciudad: where_secop2.append(f"upper(ciudad) like upper('%{ciudad}%')")
    if palabra_clave: where_secop2.append(f"(upper(descripcion_del_proceso) like upper('%{palabra_clave}%') OR upper(documentos_tipo) like upper('%{palabra_clave}%'))")
    if codigo_unspsc: where_secop2.append(f"codigo_de_categoria_principal like '{codigo_unspsc}%'")
    if fecha_inicio and fecha_fin: where_secop2.append(f"fecha_de_firma between '{fecha_inicio}T00:00:00.000' and '{fecha_fin}T23:59:59.000'")
        
    query_secop2 = " AND ".join(where_secop2) if where_secop2 else "1=1"
    
    where_secop1 = []
    if nombre: where_secop1.append(f"(upper(nombre_entidad) like upper('%{nombre}%') OR upper(nom_razon_social_contratista) like upper('%{nombre}%'))")
    if documento: where_secop1.append(f"identificacion_del_contratista = '{documento}'")
    if ciudad: where_secop1.append(f"upper(municipios_ejecucion) like upper('%{ciudad}%')")
    if palabra_clave: where_secop1.append(f"upper(detalle_del_objeto_a_contratar) like upper('%{palabra_clave}%')")
    if codigo_unspsc: where_secop1.append(f"(id_clase like '{codigo_unspsc}%' OR id_familia like '{codigo_unspsc}%')")
    if fecha_inicio and fecha_fin: where_secop1.append(f"fecha_de_firma_del_contrato between '{fecha_inicio}T00:00:00.000' and '{fecha_fin}T23:59:59.000'")
        
    query_secop1 = " AND ".join(where_secop1) if where_secop1 else "1=1"

    params_secop2 = {"$where": query_secop2, "$limit": 500, "$order": "fecha_de_firma DESC"}
    params_secop1 = {"$where": query_secop1, "$limit": 500, "$order": "fecha_de_firma_del_contrato DESC"}
    
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=ctx)) as session:
        results = await asyncio.gather(
            fetch_socrata(session, SOCRATA_SECOP2_URL, params_secop2),
            fetch_socrata(session, SOCRATA_SECOP1_URL, params_secop1)
        )
        
    data_secop2, data_secop1 = results
    total_count = len(data_secop2) + len(data_secop1)
    
    if total_count == 0:
        return {"job_id": None, "count": 0, "message": "No se encontraron contratos."}

    job_id = f"Busqueda_Directa_{uuid.uuid4().hex[:6]}"
    
    is_processing = (len(data_secop2) == 500 or len(data_secop1) == 500)
    
    nuevo_analisis = AnalisisRealizado(
        id=job_id,
        nombre_analisis=job_id,
        sha256_archivo="API_DIRECT_MIX",
        nombre_documento="Búsqueda Nativa SECOP I & II",
        total_columnas=0,
        columna_escogida="proceso_de_compra",
        estado=EstadoAnalisis.PROCESANDO if is_processing else EstadoAnalisis.COMPLETADO,
        parametros_busqueda=search_hash,
        progreso_descarga=total_count
    )
    db.add(nuevo_analisis)

    seen_keys = set()
    
    for item in data_secop2:
        llave = item.get("proceso_de_compra")
        if not llave or llave in seen_keys: continue
        seen_keys.add(llave)
        
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
                urlproceso=extract_url(item, "urlproceso"),
                fecha_de_inicio_del_contrato=item.get("fecha_de_inicio_del_contrato"),
                fecha_de_fin_del_contrato=item.get("fecha_de_fin_del_contrato"),
                datos_adicionales=item
            )
            db.add(cache_entry)
        db.add(ContratoAnalisis(id_analisis=job_id, llave_busqueda=llave))

    for item in data_secop1:
        llave = item.get("uid")
        if not llave or llave in seen_keys: continue
        seen_keys.add(llave)
        
        doc_proveedor = item.get("identificacion_del_contratista") or item.get("identific_representante_legal")
        
        secop1_entry = db.query(SecopIBruto).filter(SecopIBruto.uid == llave).first()
        if not secop1_entry:
            secop1_entry = SecopIBruto(
                uid=llave,
                anno_cargue=item.get("anno_cargue_secop"),
                numero_constancia=item.get("numero_de_constancia"),
                numero_proceso=item.get("numero_de_proceso"),
                numero_contrato=item.get("numero_de_contrato"),
                nivel_entidad=item.get("nivel_entidad"),
                orden_entidad=item.get("orden_entidad"),
                nombre_entidad=item.get("nombre_entidad"),
                nit_entidad=item.get("nit_de_la_entidad"),
                codigo_entidad=item.get("c_digo_de_la_entidad"),
                departamento_entidad=item.get("departamento_entidad"),
                municipio_entidad=item.get("municipio_entidad"),
                estado_proceso=item.get("estado_del_proceso"),
                tipo_proceso=item.get("modalidad_de_contratacion"),
                regimen_contratacion=item.get("nombre_regimen_de_contratacion"),
                objeto_contratar=item.get("objeto_a_contratar"),
                detalle_objeto=item.get("detalle_del_objeto_a_contratar"),
                tipo_contrato=item.get("tipo_de_contrato"),
                causal_otras_compras=item.get("causal_de_otras_formas_de"),
                id_grupo=item.get("id_grupo"),
                nombre_grupo=item.get("nombre_grupo"),
                id_familia=item.get("id_familia"),
                nombre_familia=item.get("nombre_familia"),
                id_clase=item.get("id_clase"),
                nombre_clase=item.get("nombre_clase"),
                tipo_identificacion=item.get("tipo_identifi_del_contratista"),
                identificacion=item.get("identificacion_del_contratista"),
                nombre_contratista=item.get("nom_razon_social_contratista"),
                dpto_mpio_contratista=item.get("dpto_y_muni_contratista"),
                tipo_doc_representante=item.get("tipo_doc_representante_legal"),
                identificacion_representante=item.get("identific_representante_legal"),
                nombre_representante=item.get("nombre_del_represen_legal"),
                cuantia_proceso=parse_float(item.get("cuantia_proceso")),
                cuantia_contrato=parse_float(item.get("cuantia_contrato")),
                valor_total_adiciones=parse_float(item.get("valor_total_de_adiciones")),
                cuantia_definitiva=parse_float(item.get("valor_contrato_con_adiciones")),
                compromiso_presupuestal=item.get("compromiso_presupuestal"),
                destinacion_gasto=item.get("destino_gasto"),
                fecha_cargue=item.get("fecha_de_cargue_en_el_secop"),
                anno_firma=item.get("anno_firma_contrato"),
                fecha_firma=item.get("fecha_de_firma_del_contrato"),
                fecha_ini_ejec_contrato=item.get("fecha_ini_ejec_contrato"),
                plazo_ejecucion=parse_int(item.get("plazo_de_ejec_del_contrato")),
                rango_ejecucion=item.get("rango_de_ejec_del_contrato", "Dias"),
                tiempo_adiciones=parse_int(item.get("tiempo_adiciones_en_dias")),
                rango_adiciones="Dias",
                fecha_plazo=item.get("fecha_fin_ejec_contrato"),
                fecha_liquidacion=item.get("ultima_actualizacion"),
                departamento_ejecucion=None,
                municipio_ejecucion=item.get("municipios_ejecucion"),
                ruta_web=extract_url(item, "ruta_proceso_en_secop_i")
            )
            db.add(secop1_entry)
            
        cache_entry = db.query(CacheSecop).filter(CacheSecop.llave_busqueda == llave).first()
        if not cache_entry:
            cache_entry = CacheSecop(
                llave_busqueda=llave,
                nombre_entidad=item.get("nombre_entidad"),
                nit_entidad=item.get("nit_de_la_entidad"),
                ciudad=item.get("municipios_ejecucion"),
                fecha_de_firma=item.get("fecha_de_firma_del_contrato"),
                proveedor_adjudicado=item.get("nom_razon_social_contratista"),
                documento_proveedor=doc_proveedor,
                valor_del_contrato=item.get("cuantia_contrato"),
                descripcion_del_proceso=item.get("detalle_del_objeto_a_contratar", item.get("objeto_a_contratar")),
                estado_contrato=item.get("estado_del_proceso"),
                urlproceso=extract_url(item, "ruta_proceso_en_secop_i"),
                fecha_de_inicio_del_contrato=item.get("fecha_ini_ejec_contrato"),
                fecha_de_fin_del_contrato=item.get("fecha_fin_ejec_contrato"),
                datos_adicionales={"SECOP_I_BRUTO": True}
            )
            db.add(cache_entry)
        db.add(ContratoAnalisis(id_analisis=job_id, llave_busqueda=llave))

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error guardando resultados iniciales en BD: {str(e)}")

    if is_processing:
        background_tasks.add_task(background_socrata_fetcher, job_id, query_secop1, query_secop2)

    return {
        "job_id": job_id,
        "count": total_count,
        "is_background": is_processing,
        "message": "Búsqueda inicial completada. Descargando el resto en segundo plano." if is_processing else "Búsqueda completada."
    }

@router.get("/status/{job_id}")
async def get_search_status(job_id: str, db: Session = Depends(get_db)):
    job = db.query(AnalisisRealizado).filter(AnalisisRealizado.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")
    
    return {
        "estado": job.estado.value,
        "descargados": job.progreso_descarga or 0
    }
