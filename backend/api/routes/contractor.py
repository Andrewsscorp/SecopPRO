from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.database import get_db
from database.models import ContratacionTerceros, ConfiguracionAPI
from core.security import decrypt_data
import httpx
import json
import traceback

router = APIRouter()

SOCRATA_URL = "https://www.datos.gov.co/resource/jbjy-vk9h.json"

def generate_ai_report(nombre_contratista: str, nit: str, resumen: dict, db: Session) -> str:
    reporte_ia = "La inteligencia artificial no está configurada para generar el reporte."
    groq_config = db.query(ConfiguracionAPI).filter(
        ConfiguracionAPI.proveedor == "groq", 
        ConfiguracionAPI.is_active == 1
    ).first()

    if groq_config and groq_config.api_key_encriptada:
        try:
            from groq import Groq
            real_key = decrypt_data(groq_config.api_key_encriptada)
            groq_client = Groq(api_key=real_key, http_client=httpx.Client(verify=False))
            
            prompt_sistema = (
                "Eres un Auditor Forense Senior y Experto en Contratación Pública Estatal en Colombia (SECOP). "
                "Tu trabajo es emitir un DICTAMEN FORENSE PROFUNDO Y EXHAUSTIVO basado en los datos proporcionados. "
                "Debes estructurar tu reporte OBLIGATORIAMENTE con las siguientes secciones:\n"
                "1. **Resumen Ejecutivo**: Perfil general del contratista, volumen de dinero manejado y frecuencia de contratación.\n"
                "2. **Análisis de Hitos Contractuales**: Debes extraer y analizar detalladamente el PRIMER CONTRATO, el ÚLTIMO CONTRATO y el MAYOR CONTRATO (mencionando explícitamente sus FECHAS exactas, el VALOR en pesos y el MOTIVO/OBJETO de cada uno). Interpreta qué significa esta evolución histórica.\n"
                "3. **Análisis de Concentración de Riesgo (Entidades y Temporalidad)**: Evalúa las entidades principales. ¿Existe un alto riesgo de dependencia o posible favoritismo con alguna entidad? ¿Los contratos son constantes o hay picos atípicos en ciertos años?\n"
                "4. **Banderas Rojas (Red Flags) y Riesgos Financieros**: Enumera de forma crítica cualquier anomalía matemática o patrón de riesgo en estas cifras.\n"
                "5. **Conclusión y Dictamen Final**: Da un veredicto sobre la idoneidad y riesgo del tercero.\n\n"
                "Usa formato Markdown avanzado. Escribe con un tono impecable, técnico, objetivo y sumamente estricto."
            )
            
            prompt_usuario = (
                f"Nombre Contratista: {nombre_contratista}\n"
                f"NIT: {nit}\n\n"
                f"DATOS FORENSES EXTRAÍDOS (Resumen histórico de contratos):\n"
                f"{json.dumps(resumen, indent=2, ensure_ascii=False)}\n\n"
                "Basándote estrictamente en estos datos matemáticos e hitos, redacta tu DICTAMEN FORENSE PROFUNDO OBLIGATORIO siguiendo la estructura de 5 secciones indicada. No inventes datos."
            )

            chat_completion = groq_client.chat.completions.create(
                messages=[
                    {"role": "system", "content": prompt_sistema},
                    {"role": "user", "content": prompt_usuario}
                ],
                model="llama-3.3-70b-versatile",
                temperature=0.3,
                max_tokens=1500
            )
            
            if chat_completion.choices:
                reporte_ia = chat_completion.choices[0].message.content
        except Exception as e:
            traceback.print_exc()
            reporte_ia = f"**Error al generar el reporte con Groq:** {str(e)}"
            
    return reporte_ia

@router.get("/{nit}")
async def get_contractor_report(nit: str, db: Session = Depends(get_db)):
    # 1. Check Cache
    cached = db.query(ContratacionTerceros).filter(ContratacionTerceros.documento == nit).first()
    if cached:
        # Lazy AI Loading: If it's cached but has no AI report (or has the default unconfigured message)
        if not cached.reporte_ia or "no está configurada" in cached.reporte_ia or "**Error" in cached.reporte_ia:
            print(f"Generando IA bajo demanda (Lazy Loading) para NIT {nit}")
            cached.reporte_ia = generate_ai_report(cached.nombre, nit, cached.resumen_calculado, db)
            db.commit()
            
        return {
            "status": "success",
            "source": "cache",
            "documento": cached.documento,
            "nombre": cached.nombre,
            "resumen": cached.resumen_calculado,
            "datos_completos": cached.datos_completos,
            "reporte_ia": cached.reporte_ia
        }

    # 2. Fetch from Socrata
    async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
        # SECOP II main dataset
        try:
            resp = await client.get(SOCRATA_URL, params={"documento_proveedor": nit, "$limit": 5000})
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail="Error conectando a SECOP II (Socrata)")
            data = resp.json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Fallo en la red hacia Socrata: {e}")

    if not data:
        raise HTTPException(status_code=404, detail="El contratista no tiene contratos registrados o el NIT es incorrecto.")

    # 3. Process Data & Calculate Summary
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
        
        # Valor
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
            
        # Entidad
        entidad = row.get("entidad", row.get("nombre_entidad", "Desconocida"))
        contratos_por_entidad[entidad] = contratos_por_entidad.get(entidad, 0) + 1
        
        # Año y Fechas
        fecha = row.get("fecha_de_firma", "")
        if fecha and len(fecha) >= 10:
            # Normalizar fecha aislando los primeros 10 caracteres YYYY-MM-DD
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

    # 4. Generate AI Report (Groq)
    reporte_ia = generate_ai_report(nombre_contratista, nit, resumen, db)

    # 5. Save to Cache
    nuevo_registro = ContratacionTerceros(
        documento=nit,
        nombre=nombre_contratista,
        datos_completos=data,
        resumen_calculado=resumen,
        reporte_ia=reporte_ia
    )
    db.add(nuevo_registro)
    db.commit()

    return {
        "status": "success",
        "source": "api",
        "documento": nit,
        "nombre": nombre_contratista,
        "resumen": resumen,
        "datos_completos": data,
        "reporte_ia": reporte_ia
    }
