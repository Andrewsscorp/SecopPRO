"""
Módulo de análisis forense de ZIPs de contratos SECOP.

Extrae el ZIP en un entorno temporal validado (protegido contra Zip Slip),
procesa cada PDF con PyMuPDF (texto nativo) o RapidOCR (páginas escaneadas,
con preprocesamiento OpenCV), y cruza el contenido con sinónimos generados
por un servicio de IA local, usando fuzzy matching.

Contrato de la función pública `analyze_zip_with_ocr`: NUNCA lanza una
excepción hacia el llamador. Cualquier fallo se refleja en el dict de
resultado, ya sea como "error" (fallo global, no se procesó nada) o como
entradas en "errors" (fallos puntuales por archivo, el resto continúa).
"""

import os
import gc
import shutil
import zipfile
import tempfile
import pathlib
import threading
import concurrent.futures
from typing import List, Optional

import fitz  # PyMuPDF
from rapidocr_onnxruntime import RapidOCR
from thefuzz import fuzz
import cv2

from services.local_ai import expand_term_with_local_ai

# --- Constantes ajustables -------------------------------------------------
MIN_NATIVE_TEXT_CHARS = 50   # por encima de esto, la página se considera texto nativo (no escaneada)
OCR_RENDER_DPI = 150         # DPI de render para OCR; subir a ~300 mejora precisión en letra pequeña
FUZZY_MATCH_THRESHOLD = 85   # score mínimo (thefuzz) para considerar una coincidencia válida
OCR_WORKERS = 2              # hilos paralelos para OCR por PDF; bajo a propósito para evitar CPU thrashing

# --- Disponibilidad del motor OCR ------------------------------------------
# Se hace una prueba de inicialización al importar el módulo para fallar rápido
# si RapidOCR no está disponible (modelos faltantes, entorno roto, etc.).
# La instancia real que procesa páginas NO es esta: cada hilo del
# ThreadPoolExecutor crea y reutiliza la suya propia (ver _get_ocr_engine).
try:
    _probe = RapidOCR()
    OCR_AVAILABLE = True
    del _probe
except Exception as e:
    OCR_AVAILABLE = False
    print(f"[OCR ENGINE ERROR] No se pudo inicializar RapidOCR: {e}")

_thread_local_ocr = threading.local()


def _get_ocr_engine() -> RapidOCR:
    """Devuelve una instancia de RapidOCR exclusiva del hilo actual.

    No se comparte una única instancia global entre hilos porque el
    thread-safety de rapidocr_onnxruntime a nivel de wrapper (más allá de la
    sesión ONNX pura, que sí es thread-safe) no está garantizado en su
    documentación. Compartir una instancia bajo esa duda podría producir
    resultados mezclados entre hilos SIN lanzar ningún error visible, que es
    el peor escenario posible frente a simplemente pagar el costo de memoria
    de una instancia por hilo (aquí, como mucho OCR_WORKERS instancias).
    """
    engine = getattr(_thread_local_ocr, "engine", None)
    if engine is None:
        engine = RapidOCR()
        _thread_local_ocr.engine = engine
    return engine


def _resolver_destino_seguro(member_name: str, destino_base: pathlib.Path) -> Optional[pathlib.Path]:
    """Resuelve la ruta de destino de un miembro del ZIP dentro de destino_base
    y rechaza cualquier entrada que intente escapar de esa carpeta (Zip Slip:
    rutas absolutas, '../...', etc.). Devuelve None si el miembro es sospechoso."""
    destino_base = destino_base.resolve()
    candidate = (destino_base / member_name).resolve()
    try:
        candidate.relative_to(destino_base)
    except ValueError:
        return None
    return candidate


def process_page_ocr(img_path: str) -> str:
    """Procesa una única imagen con OpenCV + RapidOCR (apta para ThreadPoolExecutor).

    Contrato: esta función JAMÁS deja escapar una excepción. En el peor caso
    devuelve cadena vacía. Esto es intencional: si corriera dentro de un
    executor.map() y lanzara, abortaría el análisis del PDF completo por el
    fallo de una sola página, perdiendo coincidencias ya encontradas en
    páginas de texto nativo del mismo documento.
    """
    text_extracted: List[str] = []
    try:
        engine = _get_ocr_engine()
        img = cv2.imread(img_path)
        result = None

        if img is not None:
            try:
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
                enhanced = clahe.apply(gray)
                cleaned = cv2.medianBlur(enhanced, 3)
                final_img = cv2.cvtColor(cleaned, cv2.COLOR_GRAY2BGR)
                result, _ = engine(final_img)
            except Exception as e_cv:
                print(f"[OCR OPENCV] Error preprocesando {os.path.basename(img_path)}: {e_cv}. Reintentando sin preprocesar.")
                try:
                    result, _ = engine(img_path)
                except Exception as e_fallback:
                    print(f"[OCR ENGINE] Fallback también falló para {os.path.basename(img_path)}: {e_fallback}")
                    result = None
        else:
            print(f"[OCR OPENCV] No se pudo leer {os.path.basename(img_path)} con OpenCV; intentando OCR directo.")
            try:
                result, _ = engine(img_path)
            except Exception as e_direct:
                print(f"[OCR ENGINE] OCR directo también falló para {os.path.basename(img_path)}: {e_direct}")
                result = None

        if result:
            for line in result:
                try:
                    text_extracted.append(line[1])
                except (IndexError, TypeError):
                    continue

    except Exception as e_general:
        # Red de seguridad final: ningún error, del tipo que sea, debe escapar.
        print(f"[OCR ENGINE] Error inesperado procesando {os.path.basename(img_path)}: {e_general}")
    finally:
        try:
            os.remove(img_path)
        except Exception:
            pass

    return " ".join(text_extracted)


def analyze_zip_with_ocr(zip_path: str, search_term: str) -> dict:
    """
    Recibe un ZIP de contratos, lo extrae en un entorno temporal validado,
    procesa los PDFs con PyMuPDF (nativo) o RapidOCR (escaneado), y cruza
    con la IA Local. No lanza excepciones: ver docstring del módulo.
    """
    if not OCR_AVAILABLE:
        return {"error": "Motor OCR (RapidOCR) no disponible."}

    if not os.path.exists(zip_path):
        return {"error": "ZIP no encontrado."}

    try:
        synonyms = expand_term_with_local_ai(search_term)
        if not synonyms:
            synonyms = [search_term]
    except Exception as e_ia:
        print(f"[IA LOCAL] No se pudo expandir '{search_term}': {e_ia}. Usando el término original.")
        synonyms = [search_term]

    findings = {
        "term": search_term,
        "synonyms_used": synonyms,
        "matches": [],
        "errors": [],       # fallos puntuales por archivo (no abortan el resto)
        "files_processed": 0,
    }

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_root = pathlib.Path(temp_dir)
        extract_dir = temp_root / "extracted"
        images_dir = temp_root / "images"
        extract_dir.mkdir(parents=True, exist_ok=True)
        images_dir.mkdir(parents=True, exist_ok=True)

        # --- Extracción miembro por miembro, validada contra Zip Slip -----
        try:
            with zipfile.ZipFile(zip_path, "r") as zip_ref:
                for member in zip_ref.infolist():
                    if member.is_dir():
                        continue

                    target_path = _resolver_destino_seguro(member.filename, extract_dir)
                    if target_path is None:
                        findings["errors"].append({
                            "file": member.filename,
                            "reason": "Ruta sospechosa dentro del ZIP (posible Zip Slip); se omitió.",
                        })
                        continue

                    try:
                        target_path.parent.mkdir(parents=True, exist_ok=True)
                        with zip_ref.open(member) as source, open(target_path, "wb") as dest:
                            shutil.copyfileobj(source, dest)
                    except Exception as e_member:
                        # Cubre, entre otros, entradas cifradas (RuntimeError) sin
                        # tumbar la extracción de los demás archivos del ZIP.
                        findings["errors"].append({
                            "file": member.filename,
                            "reason": f"No se pudo extraer: {str(e_member)[:150]}",
                        })
                        continue
        except zipfile.BadZipFile:
            return {"error": "Archivo ZIP corrupto o vacío."}
        except Exception as e_zip:
            return {"error": f"No se pudo abrir el ZIP: {str(e_zip)[:150]}"}

        # --- Análisis de cada PDF extraído ---------------------------------
        for pdf_index, pdf_path in enumerate(extract_dir.rglob("*.pdf")):
            file_name = pdf_path.name
            doc = None
            try:
                document_text: List[str] = []
                pages_to_ocr: List[str] = []

                doc = fitz.open(str(pdf_path))

                if doc.needs_pass:
                    # Muchos PDFs de entidades públicas están "cifrados" solo para
                    # restringir edición, con contraseña de lectura vacía.
                    if not doc.authenticate(""):
                        findings["errors"].append({"file": file_name, "reason": "PDF protegido con contraseña; se omitió."})
                        continue

                zoom = OCR_RENDER_DPI / 72.0
                mat = fitz.Matrix(zoom, zoom)

                for i, page in enumerate(doc):
                    page_text = page.get_text("text").strip()
                    if len(page_text) > MIN_NATIVE_TEXT_CHARS:
                        document_text.append(page_text)
                    else:
                        pix = page.get_pixmap(matrix=mat, alpha=False)
                        # Nombre único por (pdf, página) aunque haya PDFs con el mismo
                        # nombre en subcarpetas distintas del ZIP.
                        img_path = str(images_dir / f"doc{pdf_index}_page{i}.png")
                        pix.save(img_path)
                        pages_to_ocr.append(img_path)

                if pages_to_ocr:
                    with concurrent.futures.ThreadPoolExecutor(max_workers=OCR_WORKERS) as executor:
                        # list(...) fuerza evaluación completa aquí mismo; process_page_ocr
                        # ya garantiza no lanzar, esto es solo defensa adicional.
                        ocr_results = list(executor.map(process_page_ocr, pages_to_ocr))
                    document_text.extend(ocr_results)

                full_text = " ".join(document_text)

                file_matches = []
                for syn in synonyms:
                    score = fuzz.partial_ratio(syn.lower(), full_text.lower())
                    if score >= FUZZY_MATCH_THRESHOLD:
                        file_matches.append({"matched_synonym": syn, "confidence": score})

                if file_matches:
                    file_matches.sort(key=lambda m: m["confidence"], reverse=True)
                    findings["matches"].append({
                        "file": file_name,
                        "matched_synonym": file_matches[0]["matched_synonym"],
                        "confidence": file_matches[0]["confidence"],
                        "all_matches": file_matches,
                    })

                findings["files_processed"] += 1

            except Exception as e:
                print(f"[OCR ENGINE] Error procesando PDF {file_name}: {e}")
                findings["errors"].append({"file": file_name, "reason": str(e)[:150]})
            finally:
                if doc is not None:
                    try:
                        doc.close()
                    except Exception:
                        pass
                gc.collect()

    return findings
