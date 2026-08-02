import os
import sys
import json
import time
import httpx

# Forzar UTF-8 en Windows Console
sys.stdout.reconfigure(encoding='utf-8')

# Importar lógica de DB para extraer la llave de la UI
from database.database import SessionLocal
from database.models import ConfiguracionAPI
from core.security import decrypt_data

def get_gemini_config():
    db = SessionLocal()
    try:
        config = db.query(ConfiguracionAPI).filter(ConfiguracionAPI.proveedor == 'gemini').first()
        if config and config.api_key_encriptada:
            return {
                "key": decrypt_data(config.api_key_encriptada),
                "model": config.modelo or "gemini-1.5-pro-latest"
            }
        return None
    finally:
        db.close()

gemini_config = get_gemini_config()

if not gemini_config:
    print("❌ ERROR: No se encontró la llave de Gemini en la base de datos (UI).")
    exit(1)
    
API_KEY = gemini_config["key"]
MODEL_NAME = gemini_config["model"]

SYSTEM_INSTRUCTION = """
Actúa como un Auditor Forense Especialista en Contratación Pública del Estado Colombiano.
Tu objetivo es redactar un Resumen Ejecutivo detallado a partir de un listado de procesos de contratación extraídos del SECOP.
Debes detectar patrones de riesgo, concentración económica en un solo contratista, anomalías en las modalidades de contratación,
alertas por fechas (ej. inicio de ejecución antes de la firma), y coherencia en los valores.

Estructura esperada:
1. Panorama General (estadísticas globales rápidas y contexto).
2. Hallazgos de Riesgo (si hay alertas rojas).
3. Análisis de Contratistas (concentración de contratos o dinero).
4. Conclusión Forense.

Ignora la estructura JSON en tu respuesta final. Tu salida debe ser texto profesional, directo, formateado en Markdown, sin saludar ni despedirte.
"""

from database.models import ConfiguracionAPI, AnalisisRealizado, ContratoAnalisis, CacheSecop

def get_contracts_data():
    """Obtiene los contratos del análisis más reciente de la base de datos."""
    db = SessionLocal()
    try:
        # Obtener el último análisis
        ultimo_analisis = db.query(AnalisisRealizado).order_by(AnalisisRealizado.hora_inicio.desc()).first()
        
        if not ultimo_analisis:
            print("❌ No hay análisis en la base de datos.")
            return []
            
        job_id = ultimo_analisis.id
        print(f"🔍 Usando Análisis ID: {job_id}")

        # Extraer contratos asociados cruzando ContratoAnalisis y CacheSecop
        contratos = db.query(ContratoAnalisis, CacheSecop).join(
            CacheSecop, ContratoAnalisis.llave_busqueda == CacheSecop.llave_busqueda
        ).filter(ContratoAnalisis.id_analisis == job_id).all()
        
        result = []
        for c, cs in contratos:
            result.append({
                "numero_proceso": cs.llave_busqueda,
                "nombre_entidad": cs.nombre_entidad,
                "contratista": cs.proveedor_adjudicado,
                "nit_contratista": cs.documento_proveedor,
                "valor": cs.valor_del_contrato,
                "fecha_de_firma": cs.fecha_de_firma,
                "fecha_de_inicio_del_contrato": cs.fecha_de_inicio_del_contrato,
                "fecha_de_fin_del_contrato": cs.fecha_de_fin_del_contrato,
                "modalidad_de_contratacion": cs.modalidad_de_contratacion,
                "tipo_de_contrato": cs.tipo_de_contrato
            })
            
        return result
    except Exception as e:
        print(f"❌ Error al consultar la BD: {e}")
        return []
    finally:
        db.close()



def analyze_with_retry(payload_text, max_retries=5):
    """Envía el texto a Gemini vía HTTP directo, reintentando automáticamente."""
    attempt = 0
    base_wait_time = 15

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_NAME}:generateContent?key={API_KEY}"
    
    data = {
        "system_instruction": {
            "parts": [{"text": SYSTEM_INSTRUCTION}]
        },
        "contents": [
            {"parts": [{"text": payload_text}]}
        ]
    }

    # Desactivamos verificación SSL explícitamente con verify=False
    client = httpx.Client(verify=False, timeout=120.0)

    while attempt < max_retries:
        try:
            print(f"⏳ Enviando a Gemini (Intento {attempt + 1}/{max_retries})...")
            response = client.post(url, json=data)
            
            if response.status_code == 200:
                result = response.json()
                try:
                    return result["candidates"][0]["content"]["parts"][0]["text"]
                except (KeyError, IndexError):
                    return "❌ Error parseando la respuesta de Gemini."
            elif response.status_code == 429:
                wait_time = base_wait_time * (2 ** attempt)
                print(f"⚠️ Rate Limit alcanzado (429). Esperando {wait_time} s...")
                time.sleep(wait_time)
                attempt += 1
            else:
                print(f"❌ Error HTTP {response.status_code}: {response.text}")
                break
        
        except Exception as e:
            print(f"❌ Error de conexión: {str(e)}")
            break
            
    client.close()
    return "❌ No se pudo generar el reporte tras múltiples intentos."

def main():
    print("🚀 Iniciando prueba de Auditoría Forense con Gemini...")
    contracts = get_contracts_data()
    
    if not contracts:
        print("No se encontraron contratos para analizar.")
        return

    total = len(contracts)
    print(f"📊 Total de contratos encontrados: {total}")
    
    # Si son demasiados contratos (ej. > 100), podríamos partirlos por el límite de tokens,
    # pero Gemini 1.5 Pro soporta 2 millones de tokens. Enviar 1000 JSONs pequeños no es problema.
    # Por seguridad y para la prueba rápida, limitaremos a 100 si es enorme,
    # aunque pasaremos todo si es razonable.
    
    max_test_size = 500
    if total > max_test_size:
        print(f"⚠️ Reduciendo lote a {max_test_size} contratos para esta primera prueba.")
        contracts_to_send = contracts[:max_test_size]
    else:
        contracts_to_send = contracts

    json_payload = json.dumps(contracts_to_send, ensure_ascii=False, indent=2)
    print(f"📦 Tamaño del Payload JSON: {len(json_payload)} bytes.")
    
    prompt = f"Analiza el siguiente conjunto de datos JSON de contratos públicos:\n\n{json_payload}"
    
    print("\n" + "="*50)
    resultado = analyze_with_retry(prompt)
    print("="*50 + "\n")
    
    print("✅ RESULTADO DEL ANÁLISIS:\n")
    print(resultado)
    
    # Guardar en archivo para revisión
    with open("resultado_auditoria_test.md", "w", encoding="utf-8") as f:
        f.write(resultado)
    print("\n📝 El resultado completo ha sido guardado en 'resultado_auditoria_test.md'")

if __name__ == "__main__":
    main()
