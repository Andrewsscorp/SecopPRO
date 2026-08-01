"""
Módulo de análisis forense de ZIPs de contratos SECOP.

Extrae el ZIP en un entorno temporal validado (protegido contra Zip Slip),
procesa cada PDF con PyMuPDF (texto nativo) o RapidOCR (páginas escaneadas),
y cruza el contenido con sinónimos generados por un servicio de IA local.

Nuevo comportamiento v3.0: 
Extrae contexto (-3 y +3 bloques de texto) alrededor de la coincidencia y 
genera SHA256 para trazabilidad forense.
"""

import os
import gc
import shutil
import zipfile
import tempfile
import pathlib
import threading
import concurrent.futures
import hashlib
from typing import List, Optional

import fitz  # PyMuPDF
from rapidocr_onnxruntime import RapidOCR
from thefuzz import fuzz
import cv2

from services.local_ai import expand_term_with_local_ai

MIN_NATIVE_TEXT_CHARS = 50
OCR_RENDER_DPI = 150
FUZZY_MATCH_THRESHOLD = 85
OCR_WORKERS = 2

try:
    _probe = RapidOCR()
    OCR_AVAILABLE = True
    del _probe
except Exception as e:
    OCR_AVAILABLE = False
    print(f"[OCR ENGINE ERROR] No se pudo inicializar RapidOCR: {e}")

_thread_local_ocr = threading.local()


def _get_ocr_engine() -> RapidOCR:
    engine = getattr(_thread_local_ocr, "engine", None)
    if engine is None:
        engine = RapidOCR()
        _thread_local_ocr.engine = engine
    return engine


def _resolver_destino_seguro(member_name: str, destino_base: pathlib.Path) -> Optional[pathlib.Path]:
    destino_base = destino_base.resolve()
    candidate = (destino_base / member_name).resolve()
    try:
        candidate.relative_to(destino_base)
    except ValueError:
        return None
    return candidate


def process_page_ocr(img_path: str) -> List[str]:
    """Procesa una única imagen con OpenCV + RapidOCR. Retorna líneas (bloques)."""
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
                except Exception:
                    result = None
        else:
            try:
                result, _ = engine(img_path)
            except Exception:
                result = None

        if result:
            for line in result:
                try:
                    text_extracted.append(line[1])
                except (IndexError, TypeError):
                    continue

    except Exception:
        pass
    finally:
        try:
            os.remove(img_path)
        except Exception:
            pass

    return text_extracted


def _hash_file(filepath: str) -> str:
    hasher = hashlib.sha256()
    with open(filepath, 'rb') as afile:
        buf = afile.read(65536)
        while len(buf) > 0:
            hasher.update(buf)
            buf = afile.read(65536)
    return hasher.hexdigest()


def analyze_zip_with_ocr(zip_path: str, search_term: str) -> dict:
    """
    Analiza un ZIP extrayendo texto en "bloques". Si hay coincidencia, 
    retorna 3 bloques de contexto antes y después.
    """
    if not OCR_AVAILABLE:
        return {"error": "Motor OCR (RapidOCR) no disponible."}

    if not os.path.exists(zip_path):
        return {"error": "ZIP no encontrado."}

    try:
        synonyms = expand_term_with_local_ai(search_term)
        if not synonyms:
            synonyms = [search_term]
    except Exception:
        synonyms = [search_term]

    findings = {
        "term": search_term,
        "synonyms_used": synonyms,
        "matches": [],
        "errors": [],
        "files_processed": 0,
    }

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_root = pathlib.Path(temp_dir)
        extract_dir = temp_root / "extracted"
        images_dir = temp_root / "images"
        extract_dir.mkdir(parents=True, exist_ok=True)
        images_dir.mkdir(parents=True, exist_ok=True)

        try:
            with zipfile.ZipFile(zip_path, "r") as zip_ref:
                for member in zip_ref.infolist():
                    if member.is_dir():
                        continue
                    target_path = _resolver_destino_seguro(member.filename, extract_dir)
                    if target_path is None:
                        continue
                    try:
                        target_path.parent.mkdir(parents=True, exist_ok=True)
                        with zip_ref.open(member) as source, open(target_path, "wb") as dest:
                            shutil.copyfileobj(source, dest)
                    except Exception as e_member:
                        findings["errors"].append({"file": member.filename, "reason": str(e_member)[:150]})
                        continue
        except Exception as e_zip:
            return {"error": f"No se pudo abrir el ZIP: {str(e_zip)[:150]}"}

        for pdf_index, pdf_path in enumerate(extract_dir.rglob("*.pdf")):
            file_name = pdf_path.name
            doc = None
            try:
                file_sha256 = _hash_file(str(pdf_path))
                
                document_blocks: List[str] = []
                pages_to_ocr: List[str] = []

                doc = fitz.open(str(pdf_path))

                if doc.needs_pass and not doc.authenticate(""):
                    findings["errors"].append({"file": file_name, "reason": "PDF protegido con contraseña."})
                    continue

                zoom = OCR_RENDER_DPI / 72.0
                mat = fitz.Matrix(zoom, zoom)

                for i, page in enumerate(doc):
                    page_text = page.get_text("text").strip()
                    if len(page_text) > MIN_NATIVE_TEXT_CHARS:
                        # Extraer bloques (párrafos)
                        blocks = page.get_text("blocks")
                        for b in blocks:
                            if b[6] == 0:  # Tipo texto
                                txt = b[4].strip()
                                if txt:
                                    document_blocks.append(txt)
                    else:
                        pix = page.get_pixmap(matrix=mat, alpha=False)
                        img_path = str(images_dir / f"doc{pdf_index}_page{i}.png")
                        pix.save(img_path)
                        pages_to_ocr.append(img_path)

                if pages_to_ocr:
                    with concurrent.futures.ThreadPoolExecutor(max_workers=OCR_WORKERS) as executor:
                        ocr_results = list(executor.map(process_page_ocr, pages_to_ocr))
                    for page_blocks in ocr_results:
                        document_blocks.extend(page_blocks)

                # Buscar en los bloques
                for idx, block in enumerate(document_blocks):
                    for syn in synonyms:
                        score = fuzz.partial_ratio(syn.lower(), block.lower())
                        if score >= FUZZY_MATCH_THRESHOLD:
                            # Encontramos match, extraer contexto
                            start_idx = max(0, idx - 3)
                            end_idx = min(len(document_blocks), idx + 4)
                            
                            contexto_previo = " [...] ".join(document_blocks[start_idx:idx])
                            bloque_coincidencia = block
                            contexto_posterior = " [...] ".join(document_blocks[idx+1:end_idx])
                            
                            findings["matches"].append({
                                "file": file_name,
                                "sha256": file_sha256,
                                "matched_synonym": syn,
                                "confidence": score,
                                "contexto_previo": contexto_previo,
                                "bloque_coincidencia": bloque_coincidencia,
                                "contexto_posterior": contexto_posterior
                            })
                            break # No evaluar más sinónimos para este bloque

                findings["files_processed"] += 1

            except Exception as e:
                findings["errors"].append({"file": file_name, "reason": str(e)[:150]})
            finally:
                if doc is not None:
                    try:
                        doc.close()
                    except Exception:
                        pass
                gc.collect()

    # Ordenar por confidencia
    findings["matches"].sort(key=lambda m: m["confidence"], reverse=True)
    return findings
