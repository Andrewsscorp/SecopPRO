import os
import zipfile
import tempfile
import pathlib
import gc
import concurrent.futures
from typing import List

import fitz  # PyMuPDF
from rapidocr_onnxruntime import RapidOCR
from thefuzz import fuzz
import cv2
import numpy as np

from services.local_ai import expand_term_with_local_ai

# Inicializar RapidOCR (PaddleOCR portado a ONNX Runtime)
try:
    ocr_model = RapidOCR()
except Exception as e:
    ocr_model = None
    print(f"[OCR ENGINE ERROR] No se pudo inicializar RapidOCR: {e}")

def process_page_ocr(img_path: str) -> str:
    """Procesa una única imagen con OpenCV y PaddleOCR (Apto para ThreadPoolExecutor)."""
    text_extracted = []
    try:
        # 1. Leer imagen con OpenCV
        img = cv2.imread(img_path)
        
        # 2. Pre-procesamiento de Limpieza (OpenCV)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        enhanced = clahe.apply(gray)
        cleaned = cv2.medianBlur(enhanced, 3)
        final_img = cv2.cvtColor(cleaned, cv2.COLOR_GRAY2BGR)
        
        # 3. PaddleOCR
        result, _ = ocr_model(final_img)
    except Exception as e_cv:
        print(f"[OCR OPENCV] Error en preprocesamiento: {e_cv}, cayendo a modo normal.")
        result, _ = ocr_model(img_path)
        
    if result:
        for line in result:
            text_extracted.append(line[1])
            
    # Borrar la imagen de disco inmediatamente para no saturar tempdir
    try:
        os.remove(img_path)
    except Exception:
        pass
        
    return " ".join(text_extracted)


def analyze_zip_with_ocr(zip_path: str, search_term: str) -> dict:
    """
    Recibe un ZIP de contratos, lo extrae en memoria temporal,
    procesa los PDFs con PyMuPDF (nativo) o PaddleOCR (escaneado), y cruza con IA Local.
    """
    if not ocr_model:
        return {"error": "PaddleOCR no inicializado."}
        
    if not os.path.exists(zip_path):
        return {"error": "ZIP no encontrado."}
        
    # 1. Expandir término de búsqueda usando IA Local (Caché JSON)
    synonyms = expand_term_with_local_ai(search_term)
    
    findings = {
        "term": search_term,
        "synonyms_used": synonyms,
        "matches": []
    }
    
    # 2. Entorno Volátil
    with tempfile.TemporaryDirectory() as temp_dir:
        extract_dir = os.path.join(temp_dir, "extracted")
        images_dir = os.path.join(temp_dir, "images")
        os.makedirs(extract_dir)
        os.makedirs(images_dir)
        
        # Extraer ZIP
        try:
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)
        except zipfile.BadZipFile:
            return {"error": "Archivo ZIP corrupto o vacío."}
            
        # 3. Analizar cada PDF extraído
        for root, dirs, files in os.walk(extract_dir):
            for file in files:
                if file.lower().endswith(".pdf"):
                    pdf_path = os.path.join(root, file)
                    
                    try:
                        document_text = []
                        pages_to_ocr = []
                        
                        doc = fitz.open(pdf_path)
                        zoom = 150 / 72.0
                        mat = fitz.Matrix(zoom, zoom)
                        
                        for i, page in enumerate(doc):
                            # A) DETECCIÓN INTELIGENTE DE TEXTO NATIVO
                            page_text = page.get_text("text").strip()
                            if len(page_text) > 50:
                                # PDF Digital Nativo (Exportado de Word). Extraído en 0.01s.
                                document_text.append(page_text)
                            else:
                                # B) PDF ESCANEADO - Necesita OCR
                                pix = page.get_pixmap(matrix=mat, alpha=False)
                                img_path = os.path.join(images_dir, f"{file}_page_{i}.png")
                                pix.save(img_path)
                                pages_to_ocr.append(img_path)
                                
                        doc.close()
                        
                        # 4. Procesar OCR en paralelo (Máximo 2 workers para evitar CPU Thrashing)
                        if pages_to_ocr:
                            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                                results = executor.map(process_page_ocr, pages_to_ocr)
                                document_text.extend(results)
                        
                        # 5. Fuzzy Matching contra la bolsa de sinónimos de la IA
                        full_text = " ".join(document_text)
                        
                        matched = False
                        best_match = None
                        highest_score = 0
                        
                        for syn in synonyms:
                            score = fuzz.partial_ratio(syn.lower(), full_text.lower())
                            if score > highest_score:
                                highest_score = score
                                best_match = syn
                                
                        if highest_score >= 85:
                            findings["matches"].append({
                                "file": file,
                                "matched_synonym": best_match,
                                "confidence": highest_score
                            })
                    except Exception as e:
                        print(f"[OCR ENGINE] Error procesando PDF {file}: {e}")
                    finally:
                        # 6. Recolección explícita de basura
                        gc.collect()

    return findings
