import os
import json
import time
import httpx
from typing import List, Dict, Any, Optional, Generator

from database.database import SessionLocal
from database.models import ConfiguracionAPI, AnalisisRealizado, ContratoAnalisis, CacheSecop, PdfAiCache, ContratacionTerceros
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
Si en tu análisis realizas cualquier suma, cálculo o agregación de valores (por ejemplo, "El total contratado fue X"), DEBES declarar explícitamente qué contratos o procesos estás sumando. Muestra un desglose claro (ej. Contrato A: Valor, Contrato B: Valor -> Total: Valor). NO des un total sin mostrar sus sumandos exactos extraídos del JSON.
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

**Firma del Sistema:**
Informe generado por software SecopPRO. by Andrés Suárez.

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
[Aplica las reglas normativas provistas en el JSON a los datos de los contratos. Indica explícitamente si se cumplen o incumplen las reglas transversales y las específicas de la modalidad de cada contrato, argumentando únicamente con los datos proporcionados. Si el contrato incluye un objeto `rag_resolutions`, esto significa que la IA ya ha extraído fechas cruciales desde los documentos PDF originales del contrato. DEBES usar esas fechas de `rag_resolutions` de forma prioritaria para suplir los datos faltantes de SECOP y validar las reglas, mencionando que el dato proviene de los PDFs extraídos. Si faltan datos incluso después de revisar `rag_resolutions`, indica "Dato Faltante". NO uses formato JSON en tu respuesta, redacta un análisis formal usando tablas o viñetas y citando la norma exacta provista. Es obligatorio que cuando cites una norma extraigas e incorpores textualmente los fragmentos de la ley correspondientes desde el JSON, sin inventar ni una sola palabra.]

REGLA CRÍTICA:
Si en tu análisis realizas cualquier suma o agregación de valores (por ejemplo, al calcular concentración de contratistas), DEBES declarar explícitamente qué procesos/contratos estás sumando, mostrando el desglose (Contrato X: Valor, Contrato Y: Valor -> Total: Valor). NO des un total sin mostrar sus sumandos exactos.
Bajo ninguna circunstancia inventes o alucines datos. Todo el análisis DEBE estar basado ESTRICTAMENTE en la información de contratos proporcionada y sus `rag_resolutions`. Si un patrón no está presente, indica formalmente que no se observan anomalías en dicho aspecto. Utiliza siempre tablas Markdown nativas. NO uses emojis en tu respuesta. No saludes. NO devuelvas formato JSON, solo texto Markdown. No cites ni derives una norma que no esté explícitamente en el JSON de reglas.
"""

def get_graphics_instruction(profundidad: str) -> str:
    return f"""
Actúa como un Científico de Datos especializado en visualización para Auditorías Forenses Gubernamentales.
A partir del resumen JSON proporcionado, redacta la sección "Gráficos y Visualizaciones Analíticas".
Debes utilizar la sintaxis de **Mermaid.js** para generar gráficos que expongan visualmente los hallazgos.

NIVEL DE PROFUNDIDAD REQUERIDO: {"Genera solo los 2 gráficos más relevantes de manera rápida." if profundidad == 'basico' else "Genera hasta 5 gráficos detallados y exhaustivos según aplique a los datos."}

Evalúa los datos provistos en el JSON y genera los gráficos que sean aplicables de la siguiente lista de 5 posibles opciones. Usa los tipos de gráficos indicados para cada uno:

1. **Distribución del Presupuesto por Modalidad de Contratación** (Usa `pie title ...`)
2. **Top Contratistas por Monto Adjudicado** (DEBES usar gráfico de barras con la siguiente sintaxis exacta:)
```mermaid
xychart-beta
    title "Top Contratistas por Monto"
    x-axis ["Contratista A", "Contratista B", "Contratista C"]
    y-axis "Monto COP"
    bar [150000, 120000, 80000]
```
3. **Presupuesto por Tipo de Contrato** (Usa `pie title ...`)
4. **Cronograma de Ejecución Contractual** (Usa diagrama `gantt` con `dateFormat YYYY-MM-DD`, `fecha_de_inicio` y `fecha_de_fin`)
5. **Distribución por Departamentos** (Usa gráfico de barras `xychart-beta` o `pie` si aplica a múltiples departamentos)

Para cada gráfico que decidas generar, la estructura debe ser estrictamente esta:

### [Título del Gráfico]
[Breve explicación introductoria del gráfico]
```mermaid
[Sintaxis del gráfico aquí]
```
**Desglose de Datos:**
- [Listado detallado o viñetas indicando exactamente los contratos y valores sumados para armar este gráfico. Ej: "Contrato A: Valor, Contrato B: Valor -> Total Graficado: Valor"].
*Interpretación Forense:* [Análisis de 3-4 líneas sobre lo que revela este gráfico]

REGLA CRÍTICA:
Para cada gráfico generado, DEBES incluir obligatoriamente debajo del mismo la sección "Desglose de Datos" justificando qué procesos componen los valores. NO puedes mostrar una suma en el gráfico sin justificarla.
Asegúrate de formatear el código exactamente como un bloque de código markdown con el lenguaje `mermaid`.
Calcula los valores reales sumando los montos (en números enteros sin puntos ni comas en la sintaxis de Mermaid) desde el JSON provisto. NO inventes datos. Si los datos del JSON no tienen fechas válidas, omite el Gantt.
No saludes ni te despidas.
"""

def get_contractors_instruction(profundidad: str) -> str:
    return f"""
Actúa como un Auditor Forense Especialista en Contratación Pública del Estado Colombiano.
A partir del JSON proporcionado, el cual contiene el listado de contratos actuales analizados junto con el **historial histórico resumido de los contratistas** que los ganaron, redacta la sección "Análisis a Adjudicatarios".

NIVEL DE PROFUNDIDAD: {"Análisis directo y rápido." if profundidad == 'basico' else "Análisis profundo y exhaustivo buscando fraude o favoritismo."}

Tu objetivo es contrastar cada contrato actual con el perfil histórico del contratista, buscando los siguientes 4 patrones de riesgo (si los datos lo permiten):
1. **Riesgo de Empresa Fachada o Sin Experiencia (Análisis de Hitos):** Compara el valor del contrato actual con el historial (primer_contrato y mayor_contrato). ¿Es una empresa muy nueva o inexperta ganando un megaproyecto?
2. **Dependencia / Carrusel de Entidades:** Revisa 'entidades_top'. ¿El contratista históricamente solo trabaja con la entidad que hoy le adjudicó? ¿Indica favoritismo?
3. **Picos Atípicos de Contratación:** Observa 'contratos_por_anio'. ¿Hay picos inexplicables de crecimiento reciente?
4. **Concentración de Riqueza:** ¿Quiénes son los megacontratistas dentro del grupo evaluado?

Estructura el documento en Markdown, usando subtítulos por cada hallazgo o por cada Contratista crítico detectado.
Usa viñetas para que sea fácil de leer.

REGLA CRÍTICA:
Todo número, suma o fecha que cites DEBE provenir exactamente del JSON y debes especificar de dónde lo sacaste. 
Ejemplo: "Se alerta que el Contratista X firmó este contrato por $500.000.000, pero según su historial, su mayor contrato histórico había sido por $10.000.000."
NO encierres los valores, fechas ni nombres entre comillas invertidas (`backticks`) tipo código, escríbelos como texto normal.
Formatea todos los valores de dinero en formato de moneda legible (ej. $1.500.000 COP) y no como números crudos sin formato.
NO inventes datos. NO uses emojis. NO devuelvas JSON en tu respuesta final, solo Markdown.
"""
def get_anexos_instruction(profundidad: str) -> str:
    return f"""
Actúa como un Auditor Forense Especialista en Contratación Pública del SECOP.
Tu tarea es analizar el listado de documentos (Anexos) extraídos del proceso.

NIVEL DE PROFUNDIDAD: {profundidad}.

REGLA ESTRICTA DE NO INVENCIÓN:
No debes inventar ni asumir el contenido interno de los documentos (ya que solo tienes acceso a sus metadatos y nombres).

ESTRUCTURA REQUERIDA (OBLIGATORIA):

1. **Análisis de la Documentación (2 a 3 párrafos):**
   - Escribe un análisis forense breve sobre los tipos de documentos encontrados. Por ejemplo, evalúa si predominan documentos técnicos, financieros o resoluciones.
   - Si detectas que hay documentos marcados con la leyenda "Hash no disponible - Documento excluido de descarga local" u otra frase que indique que no se descargaron, menciónalo y explica que solo se recuperó su metadata.
   - **IMPORTANTE:** Dedica al menos un párrafo a explicar claramente qué es el hash SHA256 y por qué la presencia de esta huella criptográfica garantiza la trazabilidad y la integridad de los documentos (no repudio y prevención de alteraciones posteriores a la descarga).

2. **Detalle de Anexos:**
   - Para cada documento en el JSON proporcionado, crea una viñeta línea por línea con la siguiente estructura:
     - **Documento:** [Nombre exacto del documento]
     - **SHA256:** [Hash del documento o leyenda de no disponibilidad]
     - **Fecha de Guardado:** [Fecha en la que fue procesado o extraído]
     - **Descripción:** [Infiere una breve descripción funcional basándote EXCLUSIVAMENTE en el nombre del archivo]

No uses tablas complejas, usa la estructura de viñetas mencionada para la lista.
"""

def get_anexos_payload(job_id: str) -> str:
    from database.models import PDFsConsulta, ContratoAnalisis
    db = SessionLocal()
    try:
        # Traemos todas las consultas de PDFs relacionadas a las llaves de este análisis
        llaves = [c.llave_busqueda for c in db.query(ContratoAnalisis).filter(ContratoAnalisis.id_analisis == job_id).all()]
        if not llaves:
            return "[]"
            
        pdfs = db.query(PDFsConsulta).filter(PDFsConsulta.llave_busqueda.in_(llaves)).all()
        
        result = []
        for p in pdfs:
            fecha_str = p.fecha_guardado.strftime("%Y-%m-%d %H:%M:%S") if p.fecha_guardado else "Desconocida"
            sha_dict = p.sha256_pdfs or {}
            
            archivos = []
            for pdf_name in (p.lista_pdfs or []):
                archivos.append({
                    "nombre": pdf_name,
                    "sha256": sha_dict.get(pdf_name, "No disponible"),
                    "fecha_guardado": fecha_str
                })
                
            result.append({
                "llave_proceso": p.llave_busqueda,
                "documentos": archivos
            })
            
        return json.dumps(result, ensure_ascii=False)
    finally:
        db.close()

def get_conclusions_instruction(profundidad: str) -> str:
    return f"""
Actúa como Auditor Jefe Especialista en Contratación Pública del Estado Colombiano.
A continuación se te proveerán los textos de los informes parciales y hallazgos que TÚ MISMO generaste previamente para este proceso de auditoría (Resumen, Resultados, Comparaciones y Adjudicatarios).

Tu misión es leer esos hallazgos y redactar la sección final: "Conclusiones y Recomendaciones".

NIVEL DE PROFUNDIDAD: {"Conclusiones directas y accionables rápidas." if profundidad == 'basico' else "Conclusiones exhaustivas, rigurosas y forenses, cruzando evidencias de todos los módulos."}

REGLAS DE FORMATO Y CONTENIDO:
1. **Tabla de Riesgos:** Debes generar una tabla (Markdown) consolidando los principales riesgos detectados en todo el informe.
2. **Viñetas de Gravedad:** Clasifica los hallazgos usando viñetas e indicando claramente su gravedad: [ALTA], [MEDIA] o [BAJA].
3. **Trazabilidad:** Todo debe estar justificado con los valores, fechas y nombres exactos que leas en el texto provisto. NO inventes datos que no estén allí. NO deduzcas nombres que no fueron mencionados.
4. **Recomendaciones:** Plantea acciones correctivas claras para las entidades o para las futuras auditorías.
5. **Disclaimer Obligatorio:** Al final del documento, DEBES incluir exactamente el siguiente aviso (puedes resaltarlo en cursiva o negrita):
   "Aviso Legal y de Alcance: El presente análisis ha sido generado automáticamente por el motor de inteligencia artificial y reglas de SecopPRO. El auditor humano es responsable exclusivo de revisar, verificar y validar estos análisis contra las fuentes originales del SECOP antes de emitir cualquier dictamen o concepto oficial. Informe generado por software SecopPRO by Andrés Suárez."

NO uses emojis. NO devuelvas JSON. Redacta de forma profesional y corporativa.
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
                        "departamento": cs.departamento,
                        "rag_resolutions": c.rag_resolutions
                    })
            return json.dumps(result, ensure_ascii=False)
        finally:
            db.close()

    def get_contractors_payload(self, job_id: str, selected_nits: Optional[List[str]] = None) -> str:
        """Obtiene contratos de la muestra actual cruzados con el historial del contratista. 
        Filtra por selected_nits si se proveen, sino toma el top 10 por valor."""
        db = SessionLocal()
        try:
            # 1. Traer los contratos actuales del job
            contratos = db.query(CacheSecop).join(
                ContratoAnalisis, ContratoAnalisis.llave_busqueda == CacheSecop.llave_busqueda
            ).filter(ContratoAnalisis.id_analisis == job_id).all()
            
            # Filtrar si nos pasan NITs específicos, si no, ordenamos y tomamos el Top 10
            if selected_nits and len(selected_nits) > 0:
                contratos = [c for c in contratos if c.documento_proveedor in selected_nits]
            else:
                def parse_val(val_str):
                    try:
                        return float(str(val_str).replace(",", "").replace(".", "").strip())
                    except:
                        return 0.0
                
                # Agrupar por NIT para encontrar los top 10 contratistas por sumatoria
                from collections import defaultdict
                nits_sum = defaultdict(float)
                for c in contratos:
                    if c.documento_proveedor:
                        nits_sum[c.documento_proveedor] += parse_val(c.valor_del_contrato)
                        
                top_10_nits = [nit for nit, _ in sorted(nits_sum.items(), key=lambda x: x[1], reverse=True)[:10]]
                contratos = [c for c in contratos if c.documento_proveedor in top_10_nits]
            
            # 2. Extraer NITs únicos finales
            nits = set([c.documento_proveedor for c in contratos if c.documento_proveedor])
            
            # 3. Traer el historial de esos NITs
            historiales = db.query(ContratacionTerceros).filter(ContratacionTerceros.documento.in_(nits)).all()
            historial_map = {h.documento: h.resumen_calculado for h in historiales}
            
            # 4. Construir payload cruzado
            result = []
            for c in contratos:
                result.append({
                    "contrato_actual": {
                        "numero_proceso": c.llave_busqueda,
                        "entidad": c.nombre_entidad,
                        "valor_adjudicado": c.valor_del_contrato,
                        "fecha_firma": c.fecha_de_firma
                    },
                    "adjudicatario": {
                        "nombre": c.proveedor_adjudicado,
                        "nit": c.documento_proveedor,
                        "historial_secop": historial_map.get(c.documento_proveedor, "No se encontró historial previo")
                    }
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

    def get_conclusions_payload(self, job_id: str) -> str:
        """Obtiene el contexto en cascada: une los textos generados en los pasos anteriores."""
        db = SessionLocal()
        try:
            cache = db.query(PdfAiCache).filter(PdfAiCache.job_id == job_id).first()
            if not cache:
                return ""
                
            cascade_text = "=== CONTEXTO GENERADO PREVIAMENTE EN LA AUDITORÍA ===\n\n"
            
            if cache.resumen:
                cascade_text += "--- SECCIÓN: RESUMEN EJECUTIVO ---\n" + cache.resumen + "\n\n"
            if cache.resultados:
                cascade_text += "--- SECCIÓN: TABLA DE RESULTADOS ---\n" + cache.resultados + "\n\n"
            if cache.comparaciones:
                cascade_text += "--- SECCIÓN: COMPARACIONES Y ANÁLISIS NORMATIVO ---\n" + cache.comparaciones + "\n\n"
            if cache.adjudicatarios:
                cascade_text += "--- SECCIÓN: ANÁLISIS A ADJUDICATARIOS ---\n" + cache.adjudicatarios + "\n\n"
                
            # Si todas están vacías, no hay contexto suficiente
            if cascade_text == "=== CONTEXTO GENERADO PREVIAMENTE EN LA AUDITORÍA ===\n\n":
                return ""
                
            return cascade_text
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
