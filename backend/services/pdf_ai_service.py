import os
import json
import time
import httpx
from typing import List, Dict, Any, Optional, Generator

from database.database import SessionLocal
from database.models import ConfiguracionAPI, AnalisisRealizado, ContratoAnalisis, CacheSecop, PdfAiCache
from core.security import decrypt_data

def get_executive_summary_instruction(profundidad: str) -> str:
    prof_text = "Haz un análisis estándar profesional."
    if profundidad == "basico":
        prof_text = "Haz un resumen muy corto y directo, usando viñetas. Prioriza velocidad y menor consumo de tokens."
    elif profundidad == "profundo":
        prof_text = "Haz un análisis exhaustivo, forense, detallando paso a paso el porqué de cada conclusión (máxima rigurosidad)."

    return f"""
Actúa como un Auditor Forense Especialista en Contratación Pública del Estado Colombiano.
Tu objetivo es redactar un Resumen Ejecutivo detallado a partir de un listado de procesos de contratación extraídos del SECOP.
Debes detectar patrones de riesgo, concentración económica en un solo contratista, anomalías en las modalidades de contratación, alertas por fechas (ej. inicio de ejecución antes de la firma), y coherencia en los valores.

NIVEL DE PROFUNDIDAD REQUERIDO: {prof_text}

Estructura esperada:
1. Panorama General (estadísticas globales rápidas y contexto).
2. Hallazgos de Riesgo (si hay alertas rojas).
3. Análisis de Contratistas (concentración de contratos o dinero).
4. Conclusión Forense.

REGLA CRÍTICA:
Bajo ninguna circunstancia uses bloques de código ASCII para dibujar tablas (ejemplo `+---+---+`). 
SIEMPRE utiliza sintaxis de tablas Markdown nativas (ejemplo | Columna 1 | Columna 2 |) para mostrar datos tabulares. No las encierres en bloques de código triple backtick (```).
BAJO NINGUNA CIRCUNSTANCIA uses emojis en el reporte. Si reportas una "Alerta Roja", escribe el texto sin el emoji de sirena ni ningún otro.

Tu salida debe ser texto profesional, directo, formateado en Markdown, sin saludar ni despedirte. Ignora la estructura JSON en tu respuesta final.
"""

def get_cover_instruction(profundidad: str) -> str:
    prof_text = "Redacta de manera profesional y moderada."
    if profundidad == "basico":
        prof_text = "Redacta de manera muy concisa y rápida."
    elif profundidad == "profundo":
        prof_text = "Redacta de manera extremadamente detallada y rigurosa."

    return f"""
Actúa como un Auditor Forense Especialista en Contratación Pública del Estado Colombiano.
Tu tarea es redactar la portada principal de un "Informe de Auditoría Forense y Análisis de Datos Contractuales".
A partir del resumen JSON proporcionado con los contratos analizados, redacta una portada profesional.

NIVEL DE PROFUNDIDAD REQUERIDO: {prof_text}

La portada debe contener estrictamente la siguiente estructura en formato Markdown:
# [Título Principal del Informe, formal y contundente]

## [Subtítulo del Informe]

**Entidades Auditadas:** [Extrae o resume las entidades principales involucradas en la muestra]

**Periodo de Análisis:** [Infiere el periodo basándote en las fechas de los contratos]

**Valor Total Auditado:** [Calcula o estima el valor total aproximado de la muestra en formato de moneda colombiana COP]

**Fecha de Emisión del Informe:** [Inserta la fecha de hoy o del informe]

**Clasificación:** CONFIDENCIAL / USO INTERNO (u otra clasificación formal apropiada)

---

**Preparado por:**
Sistema Inteligente de Auditoría Forense SecopPRO - Unidad de Análisis de Datos

**Dirigido a:**
Junta Directiva / Organismos de Control / Ciudadanía General

No saludes, no te despidas y no añades información adicional fuera de esta estructura. Solo genera el texto de la portada con la más alta calidad y formalidad de un profesional en auditoría.
"""

def get_results_instruction(profundidad: str) -> str:
    if profundidad == "basico":
        intro_text = "Genera un listado muy resumido mostrando solo el Top 10 de los contratos de mayor valor."
    elif profundidad == "profundo":
        intro_text = "Genera el catálogo completo de todos los contratos analizados sin omitir ninguno. Si hay demasiados, agrupa por entidad, pero sé muy riguroso y exhaustivo."
    else:
        intro_text = "Genera un catálogo claro y tabulado de los contratos más relevantes o de la totalidad de la muestra, según su volumen."

    return f"""
Actúa como un Analista de Datos Contractuales y Auditor Forense del SECOP.
A partir del resumen JSON proporcionado con los contratos analizados, redacta la sección de "Tabla de Resultados y Muestra Auditada".
{intro_text}

La sección debe contener estrictamente la siguiente estructura en formato Markdown:
### Detalle de Contratos Analizados

[Breve párrafo introductorio (2-3 líneas) resumiendo la muestra mostrada y su valor acumulado, manteniendo un tono formal]

| No. Proceso | Entidad Contratante | Contratista | Valor (COP) | Modalidad |
| :--- | :--- | :--- | :--- | :--- |
| [Datos...] | [Datos...] | [Datos...] | [Datos...] | [Datos...] |

*(Genera la tabla con los contratos proporcionados en el JSON siguiendo la instrucción de profundidad. Utiliza siempre tablas Markdown nativas).*

Si detectas anomalías evidentes en los valores o fechas de algún contrato específico en la muestra, añade un breve apartado titulado "### Observaciones de la Muestra" debajo de la tabla, listando puntualmente las observaciones.

No saludes, no te despidas y no añadas información adicional fuera de esta estructura.
"""

def get_comparisons_instruction(payload_text: str, profundidad: str = "medio") -> str:
    import json
    import os
    try:
        contracts = json.loads(payload_text)
        modalities = set(c.get("modalidad_de_contratacion", "").lower() for c in contracts if c.get("modalidad_de_contratacion"))
    except Exception:
        modalities = set()

    codes_to_keep = set()
    for mod in modalities:
        if "mínima cuantía" in mod or "minima cuantia" in mod:
            codes_to_keep.add("MC")
        elif "directa" in mod:
            codes_to_keep.add("CD")
        elif "licitación" in mod or "licitacion" in mod:
            codes_to_keep.add("LP")
        elif "menor cuantía" in mod or "menor cuantia" in mod:
            codes_to_keep.add("SA-MC")
        elif "subasta" in mod:
            codes_to_keep.add("SA-SI")
        elif "mérito" in mod or "merito" in mod:
            codes_to_keep.add("CM")
        elif "especial" in mod:
            codes_to_keep.add("RE")

    try:
        path = os.path.join(os.path.dirname(__file__), "..", "data", "reglas_normativas.json")
        with open(path, "r", encoding="utf-8") as f:
            full_rules = json.load(f)
        
        filtered_rules = {
            "reglas_transversales": full_rules.get("reglas_transversales", []),
            "modalidades_aplicables": []
        }
        
        for mod in full_rules.get("modalidades", []):
            if mod.get("codigo") in codes_to_keep:
                filtered_rules["modalidades_aplicables"].append(mod)
                
        rules_json_str = json.dumps(filtered_rules, ensure_ascii=False, indent=2)
    except Exception:
        rules_json_str = "{}"

    if profundidad == "basico":
        prof_text = "Realiza un chequeo normativo superficial y rápido enfocado solo en los peores incumplimientos."
    elif profundidad == "profundo":
        prof_text = "Realiza una investigación profunda y sumamente exhaustiva, evaluando estrictamente cada regla contra los datos aportados, exponiendo el razonamiento y articulado exacto."
    else:
        prof_text = "Realiza un análisis estándar profesional."

    return f"""
Actúa como un Auditor Forense Especialista en Contratación Pública del Estado Colombiano.
A partir del resumen JSON proporcionado, redacta la sección de "Comparaciones y Análisis Forense".
Tu objetivo es realizar cruces de información inteligentes para detectar concentración de contratos, favoritismos, variaciones de costos atípicas y patrones de adjudicación.

NIVEL DE PROFUNDIDAD REQUERIDO: {prof_text}

Adicionalmente, debes aplicar estrictamente las reglas normativas del siguiente JSON (Motor de Reglas de Validación) a los contratos proporcionados. El JSON ha sido filtrado inteligentemente para incluir solo las reglas transversales y las específicas de las modalidades encontradas en los datos:
<reglas_normativas>
{rules_json_str}
</reglas_normativas>

La sección debe contener la siguiente estructura en formato Markdown:

<span style="color: red;"><strong>Aviso Legal y de Alcance:</strong> Este análisis de cumplimiento normativo se basa exclusivamente en los datos generados por SECOP, leídos de la consulta previa estructurada. No incluye hallazgos derivados directamente del análisis profundo de los documentos físicos anexos (Estudios Previos, Pliegos, etc.).</span>

### Análisis de Concentración por Contratista
[Redacta un análisis detallado evaluando si hay contratistas que acaparan un gran porcentaje del presupuesto auditado. Si aplica, genera una tabla Markdown mostrando Contratista vs Total Adjudicado vs Porcentaje de Concentración]

### Análisis de Modalidades de Selección
[Evalúa el uso de modalidades restrictivas frente a modalidades competitivas (ej. Contratación Directa vs Licitación). ¿Existe un uso desproporcionado de la Contratación Directa o Mínima Cuantía para evitar licitaciones? Explica los hallazgos]

### Análisis Cronológico y de Tiempos
[Revisa las fechas de firma e inicio de ejecución. Detecta e informa sobre contratos que iniciaron antes de firmarse, o que tienen plazos de ejecución irracionalmente cortos para el objeto contractual]

### Verificación de Cumplimiento Normativo (Motor de Reglas)
[Aplica las reglas normativas provistas en el JSON a los datos de los contratos. Indica explícitamente si se cumplen o incumplen las reglas transversales y las específicas de la modalidad de cada contrato, argumentando únicamente con los datos proporcionados. Si faltan datos para evaluar una regla, indica "Dato Faltante". NO uses formato JSON en tu respuesta, redacta un análisis formal usando tablas o viñetas y citando la norma exacta provista. Es obligatorio que cuando cites una norma extraigas e incorpores textualmente los fragmentos de la ley correspondientes desde el JSON, sin inventar ni una sola palabra.]

REGLA CRÍTICA:
Bajo ninguna circunstancia inventes o alucines datos. Todo el análisis DEBE estar basado ESTRICTAMENTE en la información de contratos proporcionada. Si un patrón no está presente, indica formalmente que no se observan anomalías en dicho aspecto. Utiliza siempre tablas Markdown nativas. NO uses emojis en tu respuesta. No saludes. NO devuelvas formato JSON, solo texto Markdown. No cites ni derives una norma que no esté explícitamente en el JSON de reglas.
"""

def get_graphics_instruction(profundidad: str) -> str:
    return f"""
Actúa como un Científico de Datos especializado en visualización para Auditorías Forenses Gubernamentales.
A partir del resumen JSON proporcionado, redacta la sección "Gráficos y Visualizaciones Analíticas".
Debes utilizar la sintaxis de **Mermaid.js** para generar gráficos que expongan visualmente los hallazgos.

NIVEL DE PROFUNDIDAD REQUERIDO: {"Genera gráficos básicos y rápidos." if profundidad == 'basico' else "Genera gráficos detallados con explicaciones exhaustivas."}

La sección debe contener la siguiente estructura en formato Markdown:

### Distribución del Presupuesto por Modalidad de Contratación
[Breve explicación del gráfico]
```mermaid
pie title Presupuesto por Modalidad
    "Contratación Directa" : [Suma de valores]
    "Mínima Cuantía" : [Suma de valores]
    "Licitación Pública" : [Suma de valores]
    ...
```
*Interpretación Forense:* [Análisis de 3-4 líneas sobre lo que revela esta distribución]

### Top Contratistas por Monto Adjudicado
[Breve explicación del gráfico]
```mermaid
pie title Concentración de Presupuesto en Top Contratistas
    "Contratista 1" : [Valor]
    "Contratista 2" : [Valor]
    "Otros" : [Valor restante]
```
*Interpretación Forense:* [Análisis de 3-4 líneas sobre el nivel de monopolio o pluralidad]

REGLA CRÍTICA:
Solo utiliza la sintaxis de gráficos de pastel (`pie`) de Mermaid.js, ya que es altamente compatible.
Asegúrate de formatear el código exactamente como un bloque de código markdown con el lenguaje `mermaid`.
Calcula los valores reales sumando los montos (en números enteros sin puntos ni comas en la sintaxis de Mermaid) desde el JSON provisto. NO inventes datos. Si no hay datos suficientes, no generes el gráfico.
No saludes ni te despidas.
"""

class PdfAiService:
    def __init__(self):
        self.api_key = None
        self.model = "gemini-flash-latest"
        self._load_config()

    def _load_config(self):
        """Carga la llave de Gemini y el modelo desde la base de datos (UI)."""
        db = SessionLocal()
        try:
            config = db.query(ConfiguracionAPI).filter(ConfiguracionAPI.proveedor == 'gemini').first()
            if config and config.api_key_encriptada:
                self.api_key = decrypt_data(config.api_key_encriptada)
                self.model = config.modelo or "gemini-flash-latest"
        finally:
            db.close()

    def get_contracts_payload(self, job_id: str, profundidad: str = "medio") -> str:
        """Obtiene la data relevante de contratos desde SQLite y la retorna en formato JSON string."""
        db = SessionLocal()
        try:
            contratos = db.query(ContratoAnalisis, CacheSecop).join(
                CacheSecop, ContratoAnalisis.llave_busqueda == CacheSecop.llave_busqueda
            ).filter(ContratoAnalisis.id_analisis == job_id).all()
            
            result = []
            
            # Si es básico, ordenamos por valor (mayor a menor) y tomamos solo los 20 más relevantes para ahorrar tokens y acelerar
            if profundidad == "basico":
                def get_valor(cs):
                    v = str(cs.valor_del_contrato or "0").replace(",", "").replace(".", "").strip()
                    return float(v) if v.isdigit() else 0.0
                contratos = sorted(contratos, key=lambda x: get_valor(x[1]), reverse=True)[:20]

            for c, cs in contratos:
                if profundidad == "basico":
                    result.append({
                        "id": cs.llave_busqueda,
                        "entidad": cs.nombre_entidad,
                        "contratista": cs.proveedor_adjudicado,
                        "val": cs.valor_del_contrato,
                        "mod": cs.modalidad_de_contratacion
                    })
                else:
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
                        "tipo_de_contrato": cs.tipo_de_contrato,
                        "departamento": cs.departamento
                    })
            return json.dumps(result, ensure_ascii=False)
        finally:
            db.close()

    def get_cover_payload(self, job_id: str) -> str:
        """Obtiene una versión muy resumida de los contratos para ahorrar miles de tokens en la Portada."""
        db = SessionLocal()
        try:
            contratos = db.query(CacheSecop).join(
                ContratoAnalisis, ContratoAnalisis.llave_busqueda == CacheSecop.llave_busqueda
            ).filter(ContratoAnalisis.id_analisis == job_id).all()
            
            entidades = set()
            fechas = []
            valor_total = 0.0
            
            for c in contratos:
                if c.nombre_entidad:
                    entidades.add(c.nombre_entidad)
                if c.fecha_de_firma:
                    fechas.append(c.fecha_de_firma)
                
                # Intentar sumar valor
                val_str = str(c.valor_del_contrato or "0").replace(",", "").replace(".", "").strip()
                if val_str.isdigit():
                    valor_total += float(val_str)
                    
            if fechas:
                # Ordenamiento básico
                fechas.sort()
                min_fecha = fechas[0]
                max_fecha = fechas[-1]
            else:
                min_fecha = "Desconocida"
                max_fecha = "Desconocida"
                
            summary = {
                "entidades_involucradas": list(entidades),
                "total_contratos": len(contratos),
                "rango_fechas": f"{min_fecha} a {max_fecha}",
                "valor_total_estimado": f"${valor_total:,.2f} COP"
            }
            return json.dumps(summary, ensure_ascii=False)
        finally:
            db.close()

    def stream_generate_content(self, system_instruction: str, payload_text: str, max_retries: int = 3, profundidad: str = "medio") -> Generator[str, None, None]:
        """Realiza la petición HTTP a Gemini usando streamGenerateContent (Server-Sent Events)."""
        if not self.api_key:
            yield "data: " + json.dumps({"error": "La llave de Gemini no ha sido configurada."}) + "\n\n"
            return

        attempt = 0
        base_wait_time = 15
        
        # Override model para básico (velocidad extrema)
        modelo_actual = "gemini-flash-latest" if profundidad == "basico" else self.model
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{modelo_actual}:streamGenerateContent?key={self.api_key}&alt=sse"
        
        data = {
            "system_instruction": {
                "parts": [{"text": system_instruction}]
            },
            "contents": [
                {"parts": [{"text": payload_text}]}
            ]
        }

        while attempt < max_retries:
            try:
                # httpx stream para SSE
                with httpx.Client(verify=False, timeout=300.0) as client:
                    with client.stream("POST", url, json=data) as response:
                        if response.status_code == 429:
                            wait_time = base_wait_time * (2 ** attempt)
                            time.sleep(wait_time)
                            attempt += 1
                            continue
                            
                        if response.status_code != 200:
                            yield "data: " + json.dumps({"error": f"Error HTTP {response.status_code} desde Gemini"}) + "\n\n"
                            return

                        # Procesar flujo SSE de Gemini
                        for line in response.iter_lines():
                            if line.startswith("data: "):
                                content = line[6:]
                                if content == "[DONE]":
                                    continue
                                
                                try:
                                    chunk = json.loads(content)
                                    # Extraer texto si hay
                                    parts = chunk.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                                    if parts:
                                        text_chunk = parts[0].get("text", "")
                                        if text_chunk:
                                            yield "data: " + json.dumps({"chunk": text_chunk}) + "\n\n"
                                    
                                    # Extraer tokens usados si viene
                                    usage = chunk.get("usageMetadata")
                                    if usage:
                                        yield "data: " + json.dumps({"usage": usage}) + "\n\n"
                                        
                                except json.JSONDecodeError:
                                    pass
                        return # Flujo completado exitosamente
                        
            except Exception as e:
                yield "data: " + json.dumps({"error": f"Error de conexión: {str(e)}"}) + "\n\n"
                return
                
        yield "data: " + json.dumps({"error": "No se pudo generar tras múltiples reintentos."}) + "\n\n"
