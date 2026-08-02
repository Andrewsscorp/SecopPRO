import httpx
from sqlalchemy.orm import Session
from database.models import ContratacionTerceros
import logging

logger = logging.getLogger(__name__)

SOCRATA_URL = "https://www.datos.gov.co/resource/jbjy-vk9h.json"

async def fetch_and_summarize_contractor(nit: str, db: Session, force_secop: bool = False):
    """
    Descarga hasta 5000 contratos de un NIT, calcula el resumen financiero
    y lo guarda en ContratacionTerceros en segundo plano.
    """
    if not force_secop:
        cached = db.query(ContratacionTerceros).filter(ContratacionTerceros.documento == nit).first()
        if cached:
            return cached

    async with httpx.AsyncClient(verify=False, timeout=60.0) as client:
        try:
            resp = await client.get(SOCRATA_URL, params={"documento_proveedor": nit, "$limit": 5000})
            if resp.status_code != 200:
                logger.error(f"Error conectando a SECOP II para NIT {nit}: {resp.text}")
                return None
            data = resp.json()
        except Exception as e:
            logger.error(f"Fallo en la red hacia Socrata para NIT {nit}: {e}")
            return None

    if not data:
        return None

    nombre_contratista = data[0].get("proveedor_adjudicado", "Desconocido")
    
    total_contratos = len(data)
    valor_total = 0.0
    contratos_por_entidad = {}
    contratos_por_anio = {}
    
    primer_contrato = None
    ultimo_contrato = None
    mayor_contrato = None
    
    min_date = None
    max_date = None
    max_val = -1.0
    
    for row in data:
        objeto_str = row.get("descripcion_del_proceso", row.get("detalle_del_objeto_a_contratar", row.get("objeto_del_contrato", "No disponible")))
        
        val_str = row.get("valor_del_contrato", row.get("valor_contrato", "0"))
        try:
            val = float(val_str)
            valor_total += val
            if val > max_val:
                max_val = val
                mayor_contrato = {
                    "fecha": row.get("fecha_de_firma", ""),
                    "valor": val,
                    "motivo_objeto": objeto_str
                }
        except ValueError:
            pass
            
        entidad = row.get("entidad", row.get("nombre_entidad", "Desconocida"))
        contratos_por_entidad[entidad] = contratos_por_entidad.get(entidad, 0) + 1
        
        fecha = row.get("fecha_de_firma", "")
        if fecha and len(fecha) >= 10:
            fecha_norm = fecha[:10]
            anio = fecha_norm[:4]
            contratos_por_anio[anio] = contratos_por_anio.get(anio, 0) + 1
            
            if not min_date or fecha_norm < min_date:
                min_date = fecha_norm
                primer_contrato = {
                    "fecha": fecha_norm,
                    "valor": val_str,
                    "motivo_objeto": objeto_str
                }
            if not max_date or fecha_norm > max_date:
                max_date = fecha_norm
                ultimo_contrato = {
                    "fecha": fecha_norm,
                    "valor": val_str,
                    "motivo_objeto": objeto_str
                }

    resumen = {
        "total_contratos": total_contratos,
        "valor_total": valor_total,
        "entidades_top": dict(sorted(contratos_por_entidad.items(), key=lambda item: item[1], reverse=True)[:5]),
        "contratos_por_anio": contratos_por_anio,
        "hitos": {
            "primer_contrato": primer_contrato,
            "ultimo_contrato": ultimo_contrato,
            "mayor_contrato": mayor_contrato
        }
    }

    registro = db.query(ContratacionTerceros).filter(ContratacionTerceros.documento == nit).first()
    if not registro:
        registro = ContratacionTerceros(
            documento=nit,
            nombre=nombre_contratista,
            datos_completos=data,
            resumen_calculado=resumen,
            reporte_ia=None
        )
        db.add(registro)
    else:
        registro.nombre = nombre_contratista
        registro.datos_completos = data
        registro.resumen_calculado = resumen

    try:
        db.commit()
        db.refresh(registro)
    except Exception as e:
        db.rollback()
        logger.error(f"Error guardando ContratacionTerceros para {nit}: {e}")
        return None

    return registro
