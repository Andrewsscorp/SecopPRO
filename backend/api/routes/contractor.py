from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.database import get_db
from database.models import ContratacionTerceros, ConfiguracionAPI
from core.security import decrypt_data
import httpx
import json
import traceback

from services.contractor_service import fetch_and_summarize_contractor

router = APIRouter()

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
async def get_contractor_report(nit: str, force_refresh: bool = False, db: Session = Depends(get_db)):
    # 1. Fetch from Cache or Socrata using the shared service
    registro = await fetch_and_summarize_contractor(nit, db, force_secop=force_refresh)
    
    if not registro:
        raise HTTPException(status_code=404, detail="El contratista no tiene contratos registrados o el NIT es incorrecto.")

    # 2. Lazy AI Loading: Si está en caché pero no tiene reporte IA válido
    is_cached_ai = True
    if force_refresh or not registro.reporte_ia or "no está configurada" in registro.reporte_ia or "**Error" in registro.reporte_ia:
        print(f"Generando IA bajo demanda (Lazy Loading) para NIT {nit}")
        registro.reporte_ia = generate_ai_report(registro.nombre, nit, registro.resumen_calculado, db)
        db.commit()
        db.refresh(registro)
        is_cached_ai = False

    return {
        "status": "success",
        "source": "cache" if is_cached_ai else "api",
        "documento": registro.documento,
        "nombre": registro.nombre,
        "resumen": registro.resumen_calculado,
        "datos_completos": registro.datos_completos,
        "reporte_ia": registro.reporte_ia
    }
